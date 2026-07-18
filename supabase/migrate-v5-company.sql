-- v5:在職/離職自報 + 跨公司 k-anon 聚合統計。
-- 用法:跑過 v2/v3/v4 後,SQL Editor 貼上 → Run 一次。
--
-- 方向(使用者選的「真實目錄 + 維持匿名」):公司改用真實目錄選取(client
-- 端 companies.ts,DB 仍只存 company_code uuid、不存公司名)。這份遷移加:
--   1. profiles.employment:在職/離職自報,離職者不列入公司統計
--   2. company_rankings():跨公司聚合,但只吐 k-anon 結果,不吐任何個人列

alter table public.profiles
  add column employment text not null default 'current'
  check (employment in ('current', 'former'));

-- 跨公司排行。security definer 繞過 RLS(否則只看得到自己公司),但這個
-- 函式「只吐聚合、且只吐成員數 >= 5 的公司」—— 個人列永遠不出來,小公司
-- 也因 k-anon 門檻不會被反推出個人。只給登入者用(不 grant anon):這是
-- app 內比較,不是對外公開的點名羞辱榜。
--
-- 防灌水:每個人對公司總和的貢獻夾在「本週實際經過的時間」以內。就算有人
-- 用重疊事件把自己的 sum 灌高(client 的 unionMs 擋得住顯示,但這裡是伺服器
-- 端聚合),least(user_sum, elapsed) 也讓單人無法貢獻超過真實流逝時間。
-- ponytail: 用 least 夾制,不在 SQL 端做完整 union;要更精準再寫 gaps-and-islands。
create function public.company_rankings(week_start bigint, now_ms bigint)
returns table (company_code uuid, members int, total_ms bigint)
language sql security definer stable set search_path = '' as $$
  with per_user as (
    select p.company_code, p.user_id,
      least(
        coalesce(sum(
          greatest(0, least(e.ended_at, now_ms) - greatest(e.started_at, week_start))
        ), 0),
        now_ms - week_start
      ) as user_ms
    from public.profiles p
    left join public.slack_events e
      on e.user_id = p.user_id
     and coalesce(e.ended_at, now_ms) >= week_start
    where p.employment = 'current'
      and p.company_code is not null
    group by p.company_code, p.user_id
  )
  select company_code, count(*)::int as members, sum(user_ms)::bigint as total_ms
  from per_user
  group by company_code
  having count(*) >= 5
$$;

revoke execute on function public.company_rankings(bigint, bigint) from public, anon;
grant execute on function public.company_rankings(bigint, bigint) to authenticated;
