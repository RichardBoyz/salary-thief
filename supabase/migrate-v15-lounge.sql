-- v15:公司休息室 —— 同公司所有隊伍共用一間,即時看到彼此、聊天。
-- 用法:跑過 v14 後,SQL Editor 貼上 → Run 一次(可重跑)。
-- ⚠ 跑過 v16 之後不要再跑這個檔:這裡的舊函式不認得 v16 加的欄位,會把房間弄壞。
-- ⚠ 另一個手動步驟:Dashboard → Realtime → Settings → 關掉「Allow public access」,
--   只允許私有頻道。這個 app 在此之前完全沒用 Realtime,關掉不影響任何既有功能。
--
-- 這翻轉了 PLAN Phase 3 的「除了在線狀態,其他都不做即時連線」,理由見 PLAN v15。
--
-- 安全模型 —— 防的是「拿自己合法的 JWT 寫腳本」,不是瀏覽器上的手速:
--   1. client 只能「收」。realtime.messages 只有 select policy、沒有 insert:
--      瀏覽器不能自己在頻道裡廣播,也不能自報 presence。
--   2. 所有動作走下面的 security definer RPC:身分由 auth.uid() 蓋章(冒充不了),
--      伺服器時鐘限速、內容檢查,通過才由資料庫 realtime.send 廣播出去。
--   3. 同帳號多開:一人一列 + 每次進門發新的 session,舊分頁的 session 立刻作廢。
--   4. 不同帳號(分身)擋不住開帳號,所以把每個帳號能造成的傷害限住:每間 30 人、
--      每人速率、每公司與全專案的「事件預算」、三個舊帳號檢舉才禁言。
--   5. 事件預算是保命閥:Supabase 免費方案全專案每秒 100 則(送出與送達都算),
--      超過會把全專案的即時連線斷掉 —— 一間休息室被灌爆不能拖垮所有公司。
--      升級方案後調高 lounge_emit 裡的四個數字。

-- ---------- 表:全部開 RLS 但不給任何 policy,唯一入口是下面的 RPC ----------

-- 誰在休息室。一人一列(主鍵 user_id)—— 同帳號多開天生只有一個人影
create table if not exists public.lounge_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  company_code uuid not null,
  -- 進門時發的票。只有本人拿得到,廣播裡只出現它的雜湊(sid)
  session      uuid not null,
  x            real not null,
  y            real not null,
  dir          text not null default 'down' check (dir in ('down', 'up', 'left', 'right')),
  joined_at    bigint not null,
  moved_at     bigint not null,
  acted_at     bigint not null default 0,
  -- 心跳。超過 60 秒沒動靜就當作離開(分頁當掉、斷網,沒機會送 leave)
  seen_at      bigint not null
);
create index if not exists lounge_members_company on public.lounge_members (company_code, seen_at);

-- 聊天。只留 24 小時(pg_cron),每人每天 150 則 → 列數有上限
create table if not exists public.lounge_chat (
  id           uuid primary key default gen_random_uuid(),
  company_code uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- 暱稱反正規化:「當時是誰說的」,改暱稱不追溯
  handle       text not null,
  body         text not null check (char_length(body) between 1 and 100),
  at           bigint not null
);
create index if not exists lounge_chat_company_at on public.lounge_chat (company_code, at desc);
create index if not exists lounge_chat_user_at on public.lounge_chat (user_id, at desc);

-- 檢舉:同一人同一天對同一個對象只算一次(主鍵),每人每天 10 次,留 7 天
create table if not exists public.lounge_reports (
  reporter     uuid not null references auth.users(id) on delete cascade,
  target       uuid not null references auth.users(id) on delete cascade,
  company_code uuid not null,
  day          date not null,
  primary key (reporter, target, day)
);
create index if not exists lounge_reports_target on public.lounge_reports (target, company_code, day);

-- 禁言(只禁聊天)。一人一列
create table if not exists public.lounge_mutes (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  until_at bigint not null
);

-- 事件預算(token bucket):'global' 一列 + 每間公司一列
create table if not exists public.lounge_budget (
  key    text primary key,
  tokens double precision not null,
  at     bigint not null
);

-- 每日事件總量:'global' 一列 + 每間公司一列,留 30 天
create table if not exists public.lounge_daily (
  day    date not null,
  key    text not null,
  events bigint not null default 0,
  primary key (day, key)
);

alter table public.lounge_members enable row level security;
alter table public.lounge_chat    enable row level security;
alter table public.lounge_reports enable row level security;
alter table public.lounge_mutes   enable row level security;
alter table public.lounge_budget  enable row level security;
alter table public.lounge_daily   enable row level security;
-- 第二道:連表權限都收回。就算有人誤加了 policy,client 也碰不到這幾張表
revoke all on public.lounge_members, public.lounge_chat, public.lounge_reports,
              public.lounge_mutes, public.lounge_budget, public.lounge_daily
  from anon, authenticated;

-- ---------- 內部工具(client 不能直接呼叫) ----------

-- 伺服器時間(毫秒)。所有速率限制都用它 —— client 送來的時間一律不信
create or replace function public.lounge_ms() returns bigint
language sql stable set search_path = '' as
$$ select (extract(epoch from now()) * 1000)::bigint $$;

-- 休息室 26×11(src/office/map.ts 的 LOUNGE_RAW),牆內才算數。
-- NaN 在 Postgres 比所有數字都大、Infinity 也過不了上界,一併擋掉
create or replace function public.lounge_pos_ok(p_x real, p_y real) returns boolean
language sql immutable set search_path = '' as
$$ select coalesce(p_x >= 1 and p_x < 25 and p_y >= 1 and p_y < 10, false) $$;

-- token bucket:先補(依經過時間)再扣。不夠就不扣、回 false
create or replace function public.lounge_take(
  p_key text, p_cost double precision, p_rate double precision, p_burst double precision
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  t bigint := public.lounge_ms();
begin
  insert into public.lounge_budget (key, tokens, at) values (p_key, p_burst, t)
  on conflict (key) do nothing;
  -- greatest(0, …):並發交易的 now() 可能比上一筆寫進去的 at 還早,不能倒扣
  update public.lounge_budget b
     set tokens = least(p_burst, b.tokens + greatest(0, t - b.at) * p_rate / 1000.0) - p_cost,
         at     = greatest(b.at, t)
   where b.key = p_key
     and least(p_burst, b.tokens + greatest(0, t - b.at) * p_rate / 1000.0) >= p_cost;
  return found;
end $$;

-- 每日總量:加得上去(沒超過 cap)才回 true
create or replace function public.lounge_day_add(p_key text, p_cost bigint, p_cap bigint)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'Asia/Taipei')::date;
begin
  insert into public.lounge_daily as l (day, key, events) values (d, p_key, p_cost)
  on conflict (day, key) do update set events = l.events + excluded.events
   where l.events + excluded.events <= p_cap;
  return found;
end $$;

/*
 * 廣播。成本 = 這間休息室現在的人數:每個在場的人都會收到一則,而 Supabase 的
 * 每秒上限與每月額度都把「送達」算進去。四層預算任何一層不夠,整個動作失敗
 * (raise 讓整筆交易回滾,前面扣掉的也還回去)。
 *
 * 數字是照免費方案抓的:全專案每秒 100 則 → 預算 80;每月 200 萬 → 每天 6 萬;
 * 單一公司最多吃一半的每秒預算、三分之一的每日預算。
 */
create or replace function public.lounge_emit(p_company uuid, p_event text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  select count(*) into n from public.lounge_members
   where company_code = p_company and seen_at > public.lounge_ms() - 60000;
  n := greatest(n, 1);
  if not public.lounge_take('global', n, 80, 200)
     or not public.lounge_take(p_company::text, n, 40, 120)
     or not public.lounge_day_add('global', n, 60000)
     or not public.lounge_day_add(p_company::text, n, 20000) then
    raise exception 'lounge busy';
  end if;
  begin
    perform realtime.send(p_payload, p_event, 'lounge:' || p_company::text, true);
  exception when others then
    -- 當天的分割表要等當天第一條 websocket 連線才會建,在那之前 send 會失敗。
    -- 吞掉:動作本身已經寫進表裡,其他人下一次對帳(30 秒內)就會看到
    null;
  end;
end $$;

-- 拿 session 換回自己那一列並鎖住(同一個人的並發請求排隊,限速才不會被競態繞過)。
-- session 不對 = 這個帳號在別的分頁/裝置重新進門了,舊的這個作廢
create or replace function public.lounge_seat(p_session uuid)
returns public.lounge_members
language plpgsql security definer set search_path = '' as $$
declare
  m public.lounge_members;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into m from public.lounge_members where user_id = auth.uid() for update;
  -- 換了公司也算不在:舊公司的休息室不歸你
  if not found or m.company_code is distinct from public.my_company() then
    raise exception 'not in lounge';
  end if;
  if m.session is distinct from p_session then raise exception 'session replaced'; end if;
  return m;
end $$;

-- 收訊 policy 用:我在不在(自己公司的)休息室。security definer —— lounge_members
-- 對 client 完全不可讀,policy 直接查會永遠查不到
create or replace function public.lounge_is_member() returns boolean
language sql security definer stable set search_path = '' as
$$ select exists (select 1 from public.lounge_members
                   where user_id = auth.uid() and company_code = public.my_company()) $$;

-- ---------- 對外的 RPC ----------

-- 進門。回傳 session(之後每個動作都要帶)與 sid(它的公開代號)
create or replace function public.lounge_join(p_x real, p_y real)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  t    bigint := public.lounge_ms();
  cc   uuid;
  h    text;
  av   text;
  prev public.lounge_members;
  n    int;
  s    uuid := gen_random_uuid();
  sid  text := left(md5(s::text), 8);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select company_code, handle, avatar into cc, h, av from public.profiles where user_id = uid;
  if cc is null then raise exception 'no company'; end if;
  if not public.lounge_pos_ok(p_x, p_y) then raise exception 'bad position'; end if;

  -- 進門也限速:不然狂按進出就是在洗 join 廣播
  select * into prev from public.lounge_members where user_id = uid for update;
  if found and t - prev.joined_at < 3000 then raise exception 'too fast'; end if;

  select count(*) into n from public.lounge_members
   where company_code = cc and seen_at > t - 60000 and user_id <> uid;
  if n >= 30 then raise exception 'lounge full'; end if;

  insert into public.lounge_members (user_id, company_code, session, x, y, dir, joined_at, moved_at, seen_at)
  values (uid, cc, s, p_x, p_y, 'down', t, t, t)
  on conflict (user_id) do update set
    company_code = excluded.company_code, session = excluded.session,
    x = excluded.x, y = excluded.y, dir = excluded.dir,
    joined_at = excluded.joined_at, moved_at = excluded.moved_at, seen_at = excluded.seen_at;

  -- 暱稱與造型從 profiles 拿,不收 client 自報的 —— 冒充不了別人的名字
  perform public.lounge_emit(cc, 'join', jsonb_build_object(
    'uid', uid, 'sid', sid, 'handle', h, 'avatar', av, 'x', p_x, 'y', p_y, 'dir', 'down'));
  return json_build_object('session', s, 'sid', sid);
end $$;

-- 位置。前端只在停下、以及走路中每 2 秒送一次
create or replace function public.lounge_move(p_session uuid, p_x real, p_y real, p_dir text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t bigint := public.lounge_ms();
  m public.lounge_members := public.lounge_seat(p_session);
begin
  if p_dir is null or p_dir not in ('down', 'up', 'left', 'right') then
    raise exception 'bad position';
  end if;
  if not public.lounge_pos_ok(p_x, p_y) then raise exception 'bad position'; end if;
  -- 一秒最多 4 則,給網路抖動讓兩則擠在一起的餘裕
  if t - m.moved_at < 250 then raise exception 'too fast'; end if;
  -- 不能瞬移:走路 5 格/秒,放寬到 7 格/秒 + 1.5 格
  if sqrt(power(p_x - m.x, 2) + power(p_y - m.y, 2)) > (t - m.moved_at) * 7.0 / 1000 + 1.5 then
    raise exception 'too far';
  end if;
  update public.lounge_members
     set x = p_x, y = p_y, dir = p_dir, moved_at = t, seen_at = t
   where user_id = m.user_id;
  perform public.lounge_emit(m.company_code, 'move', jsonb_build_object(
    'uid', m.user_id, 'x', p_x, 'y', p_y, 'dir', p_dir));
end $$;

-- 心跳(站著不動時每 20 秒一次)。不廣播,只續命;5 秒內重複的直接略過、不寫
create or replace function public.lounge_ping(p_session uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t bigint := public.lounge_ms();
  m public.lounge_members := public.lounge_seat(p_session);
begin
  if t - m.seen_at >= 5000 then
    update public.lounge_members set seen_at = t where user_id = m.user_id;
  end if;
end $$;

-- 離開。session 不對(別的分頁已經接手)就什麼都不做
create or replace function public.lounge_leave(p_session uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cc  uuid;
begin
  delete from public.lounge_members
   where user_id = uid and session = p_session
  returning company_code into cc;
  if cc is null then return; end if;
  begin
    perform public.lounge_emit(cc, 'leave', jsonb_build_object('uid', uid));
  exception when others then
    null; -- 預算不夠也要讓人離開;別人 60 秒內對帳會看到
  end;
end $$;

/*
 * 聊天。限制全部用伺服器時鐘判:
 *   1. 先剝掉看不見的字元:控制字元、零寬字元、雙向覆寫(RLO 能把字倒過來顯示,
 *      拿來假冒別人說話)—— 剝完再算長度,1~100 字
 *   2. 兩則之間至少 3 秒、一天 150 則、不能跟自己上一則一樣(空白先正規化)
 *   3. 被禁言就不能說
 */
create or replace function public.lounge_say(p_session uuid, p_body text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  t         bigint := public.lounge_ms();
  m         public.lounge_members := public.lounge_seat(p_session);
  clean     text;
  h         text;
  last_at   bigint;
  last_body text;
  today_n   int;
  day0      bigint;
  mid       uuid := gen_random_uuid();
begin
  if exists (select 1 from public.lounge_mutes where user_id = m.user_id and until_at > t) then
    raise exception 'muted';
  end if;

  clean := regexp_replace(coalesce(p_body, ''),
    '[\u0001-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]', '', 'g');
  clean := btrim(regexp_replace(clean, '\s+', ' ', 'g'));
  if char_length(clean) = 0   then raise exception 'empty message'; end if;
  if char_length(clean) > 100 then raise exception 'message too long'; end if;

  select at, body into last_at, last_body
    from public.lounge_chat where user_id = m.user_id order by at desc limit 1;
  if last_at is not null and t - last_at < 3000 then raise exception 'too fast'; end if;
  if last_body = clean then raise exception 'duplicate message'; end if;

  day0 := (extract(epoch from (date_trunc('day', now() at time zone 'Asia/Taipei')
                                 at time zone 'Asia/Taipei')) * 1000)::bigint;
  select count(*) into today_n from public.lounge_chat where user_id = m.user_id and at >= day0;
  if today_n >= 150 then raise exception 'daily limit reached'; end if;

  select handle into h from public.profiles where user_id = m.user_id;
  insert into public.lounge_chat (id, company_code, user_id, handle, body, at)
  values (mid, m.company_code, m.user_id, h, clean, t);
  update public.lounge_members set seen_at = t where user_id = m.user_id;
  perform public.lounge_emit(m.company_code, 'say', jsonb_build_object(
    'id', mid, 'uid', m.user_id, 'handle', h, 'body', clean, 'at', t));
  return json_build_object('ok', true);
end $$;

-- 表情。白名單跟起鬨同一份(schema.sql 的 reactions check、src/team.ts 的 EMOJIS)
create or replace function public.lounge_emote(p_session uuid, p_emoji text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t bigint := public.lounge_ms();
  m public.lounge_members := public.lounge_seat(p_session);
begin
  if p_emoji is null or p_emoji not in ('👍', '🔥', '🐟', '👀', '😂', '🫡') then
    raise exception 'bad emoji';
  end if;
  if t - m.acted_at < 1500 then raise exception 'too fast'; end if;
  update public.lounge_members set acted_at = t, seen_at = t where user_id = m.user_id;
  perform public.lounge_emit(m.company_code, 'emote', jsonb_build_object(
    'uid', m.user_id, 'emoji', p_emoji));
end $$;

/*
 * 檢舉。同公司三個不同的人在同一天檢舉同一個人 → 禁言 24 小時(只禁聊天)。
 * 不需要管理員,也不會因為一個人看誰不順眼就成立。檢舉人的帳號要滿 24 小時 ——
 * 不然臨時開三個分身就能禁言任何人。檢舉本身也限量(一天 10 次)。
 */
create or replace function public.lounge_report(p_target uuid)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cc  uuid := public.my_company();
  d   date := (now() at time zone 'Asia/Taipei')::date;
  n   int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if cc is null then raise exception 'no company'; end if;
  if p_target is null or p_target = uid
     or not exists (select 1 from public.profiles where user_id = p_target and company_code = cc) then
    raise exception 'bad target';
  end if;
  if not exists (select 1 from auth.users where id = uid and created_at < now() - interval '24 hours') then
    raise exception 'account too new';
  end if;
  select count(*) into n from public.lounge_reports where reporter = uid and day = d;
  if n >= 10 then raise exception 'daily limit reached'; end if;

  insert into public.lounge_reports (reporter, target, company_code, day)
  values (uid, p_target, cc, d)
  on conflict do nothing;

  select count(*) into n from public.lounge_reports
   where target = p_target and company_code = cc and day = d;
  if n >= 3 then
    insert into public.lounge_mutes (user_id, until_at)
    values (p_target, public.lounge_ms() + 86400000)
    on conflict (user_id) do update
      set until_at = greatest(public.lounge_mutes.until_at, excluded.until_at);
  end if;
  return json_build_object('ok', true);
end $$;

-- 對帳:現在誰在、最近 50 則聊天、我被禁言到幾點。只回自己公司的
create or replace function public.lounge_state()
returns json
language plpgsql security definer stable set search_path = '' as $$
declare
  cc uuid := public.my_company();
  t  bigint := public.lounge_ms();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if cc is null then raise exception 'no company'; end if;
  return json_build_object(
    'members', coalesce((
      select json_agg(json_build_object(
               'uid', m.user_id, 'sid', left(md5(m.session::text), 8),
               'handle', p.handle, 'avatar', p.avatar,
               'x', m.x, 'y', m.y, 'dir', m.dir) order by m.joined_at)
        from public.lounge_members m
        join public.profiles p on p.user_id = m.user_id
       where m.company_code = cc and m.seen_at > t - 60000), '[]'::json),
    'chat', coalesce((
      select json_agg(c order by c.at)
        from (select id, user_id as uid, handle, body, at
                from public.lounge_chat
               where company_code = cc and at > t - 86400000
               order by at desc limit 50) c), '[]'::json),
    'mutedUntil', (select until_at from public.lounge_mutes
                    where user_id = auth.uid() and until_at > t)
  );
end $$;

-- ---------- 權限 ----------

revoke execute on function
  public.lounge_ms(),
  public.lounge_pos_ok(real, real),
  public.lounge_take(text, double precision, double precision, double precision),
  public.lounge_day_add(text, bigint, bigint),
  public.lounge_emit(uuid, text, jsonb),
  public.lounge_seat(uuid)
  from public, anon, authenticated;

revoke execute on function
  public.lounge_is_member(),
  public.lounge_join(real, real),
  public.lounge_move(uuid, real, real, text),
  public.lounge_ping(uuid),
  public.lounge_leave(uuid),
  public.lounge_say(uuid, text),
  public.lounge_emote(uuid, text),
  public.lounge_report(uuid),
  public.lounge_state()
  from public, anon;
grant execute on function
  public.lounge_is_member(),
  public.lounge_join(real, real),
  public.lounge_move(uuid, real, real, text),
  public.lounge_ping(uuid),
  public.lounge_leave(uuid),
  public.lounge_say(uuid, text),
  public.lounge_emote(uuid, text),
  public.lounge_report(uuid),
  public.lounge_state()
  to authenticated;

-- ---------- 即時頻道的收訊權限 ----------
-- 只有「同公司、而且人在休息室裡」才收得到 lounge:<公司碼> 的廣播。公司碼是由
-- 公開目錄推導的,沒有這條,外人算得出頻道名就能偷聽。
-- 刻意沒有 insert policy:瀏覽器不能自己廣播,也不能自報 presence。
drop policy if exists "lounge members receive" on realtime.messages;
create policy "lounge members receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'lounge:' || public.my_company()::text
    and public.lounge_is_member()
  );

-- ---------- 留存 ----------
-- 休息室不是檔案庫:聊天 24 小時、檢舉 7 天、每日計數 30 天;一小時沒心跳的人清掉
select cron.schedule(
  'lounge-prune', '*/10 * * * *',
  $$
  delete from public.lounge_members where seen_at < (extract(epoch from now()) * 1000)::bigint - 3600000;
  delete from public.lounge_chat    where at      < (extract(epoch from now()) * 1000)::bigint - 86400000;
  delete from public.lounge_mutes   where until_at < (extract(epoch from now()) * 1000)::bigint;
  delete from public.lounge_reports where day < (now() at time zone 'Asia/Taipei')::date - 7;
  delete from public.lounge_daily   where day < (now() at time zone 'Asia/Taipei')::date - 30;
  $$
);
