-- v3:魚點(隨機摸魚區塊)+ 伺服器驗證的漁獲。
-- 用法:先跑過 migrate-v2.sql,再把這份貼進 SQL Editor → Run 一次。
--
-- 防篡改設計(比「藏種子」更強的版本):
--   1. 種子放在 private schema —— PostgREST 只暴露 public,API 永遠拿不到
--   2. 時刻表由 secret+user+day 在 DB 內決定性導出,client 只能透過
--      my_spots() 看「自己今天」的表
--   3. 關鍵不是時刻表保密,是 **insert 時的伺服器時間驗證**:trigger 用
--      now() 檢查視窗是否正開著,caught_at 由伺服器蓋。就算你逆向出整份
--      時刻表也沒用 —— 你必須在視窗開著的當下打 API,事後補寫、改時間
--      戳、預先囤積全部被擋。沒有 update/delete policy,寫進去就不能改。

create schema if not exists private;

create table private.app_secret (secret text not null);
insert into private.app_secret (secret)
values (gen_random_uuid()::text || gen_random_uuid()::text);

create table public.catches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_code uuid,
  day          text not null,        -- Asia/Taipei 'YYYY-MM-DD'
  spot_index   int  not null,
  caught_at    bigint not null default 0,  -- trigger 蓋伺服器時間,client 給什麼都無視
  unique (user_id, day, spot_index)        -- 一個魚點只能抓一次
);

-- 一人一天 8 個魚點,09:00~17:49 之間開,每個視窗 10 分鐘。
-- 決定性:同一個 user 同一天永遠算出同一張表,所以不用存,永遠可重算驗證。
create function public.spot_schedule(uid uuid, d date)
returns table (spot_index int, start_ms bigint, end_ms bigint, r1 int, r2 int)
language plpgsql security definer stable set search_path = '' as $$
declare
  sec text;
  h text;
  day_start_ms bigint;
  minute int;
  i int;
begin
  select secret into sec from private.app_secret limit 1;
  day_start_ms := (extract(epoch from (d::timestamp at time zone 'Asia/Taipei')))::bigint * 1000;
  for i in 0..7 loop
    h := md5(sec || uid::text || d::text || i::text);
    -- 540 = 09:00;530 種分鐘值 → 最晚 17:49 開、17:59 收
    minute := 540 + mod((('x' || substr(h, 1, 8))::bit(32)::int & 2147483647), 530);
    spot_index := i;
    start_ms := day_start_ms + minute::bigint * 60000;
    end_ms := start_ms + 10 * 60000;
    r1 := ('x' || substr(h, 9, 2))::bit(8)::int;   -- 給 client 挑地圖格子用,純裝飾
    r2 := ('x' || substr(h, 11, 2))::bit(8)::int;
    return next;
  end loop;
end $$;

-- 不准直接呼叫 spot_schedule(不然可以查別人的表);只能走 my_spots
revoke execute on function public.spot_schedule(uuid, date) from public, anon, authenticated;

create function public.my_spots()
returns table (spot_index int, start_ms bigint, end_ms bigint, r1 int, r2 int, caught boolean)
language sql security definer stable set search_path = '' as $$
  select s.spot_index, s.start_ms, s.end_ms, s.r1, s.r2,
         exists (
           select 1 from public.catches c
           where c.user_id = auth.uid()
             and c.day = to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD')
             and c.spot_index = s.spot_index
         ) as caught
  from public.spot_schedule(auth.uid(), (now() at time zone 'Asia/Taipei')::date) s
  order by s.start_ms;
$$;

alter table public.catches enable row level security;

create policy "select own or company" on public.catches for select
  using (user_id = auth.uid() or (company_code is not null and company_code = public.my_company()));
create policy "insert own" on public.catches for insert
  with check (user_id = auth.uid());
-- 沒有 update/delete policy:漁獲不可改、不可滅證

create function public.validate_catch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  today text := to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD');
  ok boolean;
begin
  if new.day <> today then
    raise exception 'catch rejected: not today';
  end if;
  select exists (
    select 1
    from public.spot_schedule(new.user_id, (now() at time zone 'Asia/Taipei')::date) s
    where s.spot_index = new.spot_index
      and now_ms between s.start_ms and s.end_ms
  ) into ok;
  if not ok then
    raise exception 'catch rejected: no open window for spot %', new.spot_index;
  end if;
  new.caught_at := now_ms;  -- 伺服器蓋章
  return new;
end $$;

create trigger catches_validate
  before insert on public.catches
  for each row execute function public.validate_catch();

create index catches_company_caught on public.catches (company_code, caught_at desc);
