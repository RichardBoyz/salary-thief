-- 薪水小偷 schema(v2:公司 → 隊伍)。
-- 用法:全新 Supabase 專案 → SQL Editor → 貼上全部 → Run,跑一次就好。
-- 既有 v1 專案不要跑這個,跑 migrate-v2.sql。
--
-- 設計約束(PLAN.md):
--   * 公司沒有名字 —— 它只是一個匿名邀請碼(uuid)。「不存公司」是隱私硬約束
--   * 隊伍不是實體,是 profiles 上的文字標籤;隊伍清單 = 同公司 distinct team
--   * 沒有任何薪資欄位 —— 月薪永遠不上傳,排行榜只比時數
--   * 唯一的自由文字是 handle 和 team,長度都在 DB 層鎖 20
--   * emoji 鎖白名單,防止有人把自由文字塞進 emoji 欄位
--   * 時間全部 epoch 毫秒 (bigint),跟前端 localStorage 同格式,不換算
--   * 沒有 delete policy = 不能刪(單寫者模型,事件只會 insert + 補 ended_at)

create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text not null check (char_length(handle) between 1 and 20),
  company_code uuid,
  team         text check (team is null or char_length(team) between 1 and 20),
  last_seen_at bigint not null default 0
);

create table public.slack_events (
  id           uuid primary key,  -- client 端產生。單寫者:只有建立它的裝置會寫這一列
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_code uuid,
  started_at   bigint not null,
  ended_at     bigint             -- null = 摸魚中(在線訊號的一半)
);

create table public.reactions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.slack_events(id) on delete cascade,
  company_code uuid,              -- 反正規化,讓 RLS 不用巢狀查 slack_events
  from_user    uuid not null references auth.users(id) on delete cascade,
  emoji        text not null check (emoji in ('👍','🔥','🐟','👀','😂','🫡')),
  created_at   bigint not null
);

-- 查自己的公司碼。security definer:避免 profiles 的 policy 又查 profiles 造成無限遞迴
create function public.my_company() returns uuid
language sql security definer stable set search_path = '' as
$$ select company_code from public.profiles where user_id = auth.uid() $$;

alter table public.profiles     enable row level security;
alter table public.slack_events enable row level security;
alter table public.reactions    enable row level security;

-- profiles:看得到自己和同公司的人;只能建立/改自己那一列
create policy "select own or same company" on public.profiles for select
  using (user_id = auth.uid() or (company_code is not null and company_code = public.my_company()));
create policy "insert self" on public.profiles for insert
  with check (user_id = auth.uid());
create policy "update self" on public.profiles for update
  using (user_id = auth.uid());

-- slack_events:看得到自己和同公司的;只能新增/關閉自己的
create policy "select own or company" on public.slack_events for select
  using (user_id = auth.uid() or (company_code is not null and company_code = public.my_company()));
create policy "insert own" on public.slack_events for insert
  with check (user_id = auth.uid());
create policy "close own" on public.slack_events for update
  using (user_id = auth.uid());

-- reactions:同公司可見;只能以自己的名義起鬨
create policy "select company" on public.reactions for select
  using (from_user = auth.uid() or (company_code is not null and company_code = public.my_company()));
create policy "insert as self" on public.reactions for insert
  with check (from_user = auth.uid());

create index slack_events_company_started on public.slack_events (company_code, started_at desc);
create index reactions_company_created on public.reactions (company_code, created_at desc);
