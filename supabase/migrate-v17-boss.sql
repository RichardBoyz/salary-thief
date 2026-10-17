-- v17:老闆找你。用法:跑過 v8、v9 後,SQL Editor 貼上 → Run 一次(可重跑)。
--
-- 畫面不定時跳出「老闆找你」,限時內沒按「回覆」= 扣今天偷到的 20%。扣款記在收入帳:
-- zone_points 多一欄 fined(今天被扣了幾點),收入 = 外快 + 漁獲 − 被扣,現金與排行榜
-- 都跟著少。不另開表 —— 一人一天本來就只有一列,列數封頂不變(CONTRIBUTING 鐵律第 6 條)。
--
-- 扣多少由伺服器用自己記的帳算,client 只能說「我沒回」。扣款只傷自己,所以不限速:
-- 灌呼叫最多把自己今天的收入一次一次扣兩成,而且不會扣到現金變負數。
-- ⚠ 20% 寫在畫面文字裡(locales 的 bossFinedWhy),改這裡要一起改。

alter table public.zone_points
  add column if not exists fined int not null default 0 check (fined >= 0);

-- 累積偷到 = 外快 − 被扣 + 漁獲。現金(private.cash_points)從這裡算,所以跟著少
-- ⚠ 150 = src/money.ts 的 FISH_POINTS,兩邊要一起改
create or replace function private.earned_points(uid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(points - fined) from public.zone_points where user_id = uid), 0)
       + coalesce((select count(*) * 150 from public.catches where user_id = uid), 0)
$$;

-- 沒回老闆:扣今天偷到的 20%,回傳實際扣掉的點數
create or replace function public.boss_fine() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today text := to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD');
  income bigint;
  fine int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce((select points - fined from public.zone_points
                    where user_id = uid and day = today), 0)
       + coalesce((select count(*) * 150 from public.catches
                    where user_id = uid and day = today), 0)
    into income;

  -- 不扣到現金變負數:錢拿去買股票了就沒得扣。v9 的稽核規則
  -- 「現金算出負數 = 有人繞過 RPC」要繼續成立
  fine := least(floor(greatest(income, 0) * 0.2), greatest(private.cash_points(uid), 0));
  if fine <= 0 then
    return 0;
  end if;

  insert into public.zone_points (user_id, company_code, day, points, fined)
  values (uid, public.my_company(), today, 0, fine)
  on conflict (user_id, day) do update
    set fined = public.zone_points.fined + excluded.fined;

  return fine;
end $$;

revoke execute on function public.boss_fine() from public, anon;
grant execute on function public.boss_fine() to authenticated;
