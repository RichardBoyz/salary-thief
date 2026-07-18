-- v1 → v2:「隊伍」升級成「公司」,公司底下用 team 文字標籤分隊。
-- 用法:SQL Editor 貼上全部 → Run,跑一次就好。(全新專案不用這個,直接跑 schema.sql)
--
-- 既有資料的語意:你原本的隊伍變成公司,成員關係不變,之後各自選隊。
-- 公司依然沒有名字 —— 隱私原則「不存公司」不變,公司只是一個匿名邀請碼。

alter table public.profiles     rename column team_code to company_code;
alter table public.slack_events rename column team_code to company_code;
alter table public.reactions    rename column team_code to company_code;

-- 隊伍標籤。不開 teams 表:隊伍就是同公司 profiles 上 distinct 的 team 值
alter table public.profiles add column team text
  check (team is null or char_length(team) between 1 and 20);

-- select policy 都呼叫 my_team(),函式本體字串還寫著舊欄名,整組換新
drop policy "select own or teammates" on public.profiles;
drop policy "select own or team"      on public.slack_events;
drop policy "select team"             on public.reactions;
drop function public.my_team();

create function public.my_company() returns uuid
language sql security definer stable set search_path = '' as
$$ select company_code from public.profiles where user_id = auth.uid() $$;

create policy "select own or same company" on public.profiles for select
  using (user_id = auth.uid() or (company_code is not null and company_code = public.my_company()));
create policy "select own or company" on public.slack_events for select
  using (user_id = auth.uid() or (company_code is not null and company_code = public.my_company()));
create policy "select company" on public.reactions for select
  using (from_user = auth.uid() or (company_code is not null and company_code = public.my_company()));
