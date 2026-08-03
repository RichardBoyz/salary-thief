-- v8b:摸魚幣上 DB。用法:跑過 v2~v5 後,SQL Editor 貼上 → Run 一次。
--
-- 為什麼點數可以放 DB,而之前的「錢」不行:v8 起摸魚幣跟收入完全脫鉤
-- (固定 10 點/分、一條魚 150 點),點數不含任何薪資資訊,外洩也反推不出
-- 任何人賺多少。這正是「去薪水化」換來的東西。
--
-- 防竄改的邊界要講清楚(誠實比好聽重要):
--   * 擋得住:憑空生點數、改別人的點數、事後補寫、把餘額改成一兆
--   * 擋不住:「我真的站在綠框裡」本身 —— 跟摸魚時數一樣是 client 自報,
--     網頁遊戲裡人在不在本來就是 client 說了算(v3 就寫過這句)
--   * 壓制手段:每日上限 = 伺服器時鐘認定的「今天已經過了幾分鐘」×10。
--     自報再怎麼灌,也不可能超過今天實際流逝的時間。手法沿用 v5 的
--     least(user_sum, elapsed) 夾制。

create table public.zone_points (
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_code uuid,
  day          text not null,                    -- Asia/Taipei 'YYYY-MM-DD'
  points       int  not null default 0 check (points >= 0),
  primary key (user_id, day)
);

alter table public.zone_points enable row level security;

-- 只有 select policy。沒有 insert/update/delete policy = client 完全不能直接
-- 寫這張表,唯一的入口是下面那個 security definer 的 RPC(它會夾制)。
create policy "select own or company" on public.zone_points for select
  using (user_id = auth.uid() or (company_code is not null and company_code = public.my_company()));

/*
 * 回報今天在外快區站到的點數,回傳伺服器認可的值。
 *
 * 三道:只能寫自己的(內部 auth.uid())、只能往上(greatest,避免回報順序
 * 亂掉把數字弄小)、不能超過今天實際流逝的時間換算出來的上限(least)。
 * client 送什麼數字進來都無所謂 —— 出去的一定在上限內。
 */
create function public.sync_zone_points(p_points int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  taipei timestamp := now() at time zone 'Asia/Taipei';
  today text := to_char(taipei, 'YYYY-MM-DD');
  -- 今天從 00:00 到現在過了幾分鐘 × 10 點/分 = 今天理論上的最大值
  cap int := floor(extract(epoch from (taipei - date_trunc('day', taipei))) / 60)::int * 10;
  out_points int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.zone_points (user_id, company_code, day, points)
  values (uid, public.my_company(), today, least(greatest(coalesce(p_points, 0), 0), cap))
  on conflict (user_id, day) do update
    set points = least(greatest(public.zone_points.points, coalesce(excluded.points, 0)), cap),
        company_code = excluded.company_code
  returning points into out_points;

  return out_points;
end $$;

revoke execute on function public.sync_zone_points(int) from public, anon;
grant execute on function public.sync_zone_points(int) to authenticated;

-- 排行榜要按公司撈本週的點數
create index zone_points_company_day on public.zone_points (company_code, day);
