-- v11:公司留言板 + 全面的濫用防線。跑過 v9/v10 後貼上 → Run 一次。
--
-- ⚠ 這翻轉了 PLAN.md 的一條舊決定(「起鬨只做 emoji,不做文字留言」)。
--   當初不做的理由沒有消失:自由文字正是大家會把自己招出來的地方。
--   使用者知情後仍然要,所以做 —— 但長度、頻率、留存全部鎖死在 DB。
--
-- 防的是「拿自己合法的 JWT 寫腳本猛打 API」,不是防瀏覽器上的手速。所以
-- 每一條限制都在 security definer 的 RPC 裡用**伺服器時鐘**判,client 完全
-- 不能直接寫這張表(沒有 insert policy)。

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_code uuid,
  -- 暱稱反正規化:省掉每次讀取都 join profiles。改暱稱不追溯舊訊息,
  -- 對「當時是誰說的」這個語意反而是對的
  handle       text not null,
  body         text not null check (char_length(body) between 1 and 140),
  at           timestamptz not null default now()
);

alter table public.messages enable row level security;

-- 只看得到同公司的。沒有 insert/update/delete policy —— 唯一入口是下面的 RPC
create policy "select same company" on public.messages for select
  using (
    user_id = auth.uid()
    or (company_code is not null and company_code = public.my_company())
  );

create index messages_company_at on public.messages (company_code, at desc);
create index messages_user_at on public.messages (user_id, at desc);

/*
 * 發言。四道限制,全部用伺服器時鐘判:
 *   1. 長度 1~140(DB check 也擋一次,防止有人繞過 RPC 的情況)
 *   2. 兩則之間至少 10 秒 —— 擋連發
 *   3. 一天 40 則 —— 擋整天掛機的機器人
 *   4. 不能跟自己上一則一模一樣 —— 擋複製貼上洗版
 *
 * 空白正規化(連續空白壓成一個)不只是美觀:不然「同一則」可以靠多打一個
 * 空格繞過第 4 條,洗版照樣成立。
 */
create function public.post_message(p_body text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  clean      text;
  h          text;
  cc         uuid;
  last_at    timestamptz;
  last_body  text;
  today_n    int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  clean := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  if char_length(clean) = 0   then raise exception 'empty message'; end if;
  if char_length(clean) > 140 then raise exception 'message too long'; end if;

  select handle, company_code into h, cc
    from public.profiles where user_id = uid;
  if h is null then raise exception 'no profile'; end if;

  select at, body into last_at, last_body
    from public.messages where user_id = uid order by at desc limit 1;

  if last_at is not null and now() - last_at < interval '10 seconds' then
    raise exception 'too fast';
  end if;
  if last_body = clean then
    raise exception 'duplicate message';
  end if;

  select count(*) into today_n
    from public.messages
   where user_id = uid
     and at >= (date_trunc('day', now() at time zone 'Asia/Taipei')
                  at time zone 'Asia/Taipei');
  if today_n >= 40 then raise exception 'daily limit reached'; end if;

  insert into public.messages (user_id, company_code, handle, body)
  values (uid, cc, h, clean);

  return json_build_object('ok', true);
end $$;

revoke execute on function public.post_message(text) from public, anon;
grant  execute on function public.post_message(text) to authenticated;

-- ---------- 留存:留言板不是檔案庫 ----------
-- 七天前的自動清掉。這是「不讓 Supabase 扛太多」最有效的一招 —— 比任何
-- 壓縮或分頁都有效,因為根本沒有資料在那裡。
select cron.schedule(
  'messages-prune', '0 20 * * *',
  $$delete from public.messages where at < now() - interval '7 days'$$
);

-- ---------- 全專案盤點後補的一道防線 ----------
/*
 * slack_events 是唯一還能被無限灌列的表。
 *
 * v4 已經擋住「單筆時長灌爆排行榜」(≤24h),client 端 unionMs 也讓重疊
 * 事件無法虛報時數 —— 但那些防的是**數字**,沒有防**列數**。拿合法 JWT
 * 跑迴圈塞一百萬筆各一秒的事件,排行榜看起來正常,資料庫卻被灌爆。
 *
 * 每人 3000 列的天花板:正常使用者一天摸魚十幾次、一年也才幾千筆(而且
 * client 只推近 30 天),機器人則立刻撞牆。用總列數而不是每日列數,是因為
 * pushLocalEvents 會一次 upsert 近 30 天的歷史,按日計會誤傷正常的重新同步。
 */
create function public.guard_slack_events_rows()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  select count(*) into n from public.slack_events where user_id = new.user_id;
  if n >= 3000 then
    raise exception 'too many events';
  end if;
  return new;
end $$;

create trigger slack_events_row_cap
  before insert on public.slack_events
  for each row execute function public.guard_slack_events_rows();

revoke execute on function public.guard_slack_events_rows() from public, anon, authenticated;

/*
 * reactions:v4 的 unique(event_id, from_user, emoji) 擋住了「對同一則猛按
 * 同一個 emoji」,但沒擋住「對看得到的每一則事件、每一種 emoji 各按一次」。
 * 公司裡事件夠多的話,一個迴圈就是幾萬列。同樣用總列數封頂 —— 正常使用者
 * 一週按不到幾十次。
 */
create function public.guard_reactions_rows()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  select count(*) into n from public.reactions where from_user = new.from_user;
  if n >= 2000 then
    raise exception 'too many reactions';
  end if;
  return new;
end $$;

create trigger reactions_row_cap
  before insert on public.reactions
  for each row execute function public.guard_reactions_rows();

revoke execute on function public.guard_reactions_rows() from public, anon, authenticated;

/*
 * trades:買賣受現金限制,而且手續費 + 證交稅讓來回一定虧 —— 所以「無限
 * 交易」本身不成立。但買一股十元股票只要十幾點,有點數的人還是能刷出幾千
 * 列。每天 100 筆封頂:真人一天不會下一百次單,腳本會立刻撞牆。
 *
 * 放在 trigger 而不是改 buy_stock / sell_stock —— 一個地方同時管住買跟賣,
 * 不用把 v9 那兩個函式整個複製一遍。
 */
create function public.guard_trades_daily()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  select count(*) into n
    from public.trades
   where user_id = new.user_id
     and at >= (date_trunc('day', now() at time zone 'Asia/Taipei')
                  at time zone 'Asia/Taipei');
  if n >= 100 then
    raise exception 'daily trade limit reached';
  end if;
  return new;
end $$;

create trigger trades_daily_cap
  before insert on public.trades
  for each row execute function public.guard_trades_daily();

revoke execute on function public.guard_trades_daily() from public, anon, authenticated;
