-- v16:辦公室也變成即時房間 —— 跟休息室一樣看得到彼此走動、能聊天,兩間之間走門切換。
-- 用法:跑過 v15 後,SQL Editor 貼上 → Run 一次(可重跑)。跑過這個之後不要再跑 v15
-- (v15 的舊函式不認得這裡新增的欄位)。
--
-- 做法:v15 的休息室機制泛化成「房間」,安全模型一行不變(client 只收不發、所有動作
-- 走 RPC、一人一列擋多開、事件預算)。多出來的只有:
--   1. 一個人同時只在一間:休息室(同公司共用)或自己隊的辦公室。lounge_members
--      照舊一人一列,多記房間種類(kind)與頻道名(topic)。
--   2. 頻道名由伺服器從 profiles 算 —— client 指定不了要進哪一隊的辦公室,只能進
--      自己隊的;換了公司或隊伍,舊房間的票自動作廢。
--   3. 收訊 policy 從「同公司 + 在休息室」改成「頻道名 = 我現在所在的房間」。
--   4. 離開不刪列,只標記(seen_at = 0)。v15 刪列,「三秒內不能重進」就擋不住
--      「離開 → 進門」的迴圈洗廣播;有了門,進出會變頻繁,這條要補上。
--
-- 舊版前端(還沒重新整理的分頁)呼叫的 lounge_join / lounge_state 保留成轉接,
-- 照常進休息室。

-- ---------- 表 ----------

alter table public.lounge_members
  add column if not exists kind text not null default 'lounge' check (kind in ('lounge', 'office'));
alter table public.lounge_members add column if not exists topic text;
update public.lounge_members set topic = 'lounge:' || company_code::text where topic is null;
alter table public.lounge_members alter column topic set not null;
drop index if exists public.lounge_members_company;
create index if not exists lounge_members_topic on public.lounge_members (topic, seen_at);

alter table public.lounge_chat add column if not exists topic text;
update public.lounge_chat set topic = 'lounge:' || company_code::text where topic is null;
alter table public.lounge_chat alter column topic set not null;
drop index if exists public.lounge_chat_company_at;
create index if not exists lounge_chat_topic_at on public.lounge_chat (topic, at desc);

-- ---------- 內部工具 ----------

-- 房間的頻道名,從呼叫者自己的 profiles 算(client 指定不了):
--   休息室 = 'lounge:<公司碼>'(跟 v15 一樣,舊版前端照常)
--   辦公室 = 'office:<md5(公司碼/隊名)>'。隊名是自由文字,雜湊成固定長度的安全字元;
--   沒選隊的人(大廳)隊名是空字串 —— 真的隊名至少 1 個字,不會撞
-- 沒公司 → null
create or replace function public.lounge_topic(p_kind text) returns text
language sql stable security definer set search_path = '' as $$
  select case p_kind
           when 'lounge' then 'lounge:' || p.company_code::text
           when 'office' then 'office:' || md5(p.company_code::text || '/' || coalesce(p.team, ''))
         end
    from public.profiles p
   where p.user_id = auth.uid() and p.company_code is not null
$$;

-- 房間尺寸(src/office/map.ts):休息室 26×11、辦公室 20×12,牆內才算數。
-- 門開在下牆,走進門的那一格前端不送(會先夾回門口)。NaN/Infinity 一併擋掉
create or replace function public.lounge_pos_ok(p_kind text, p_x real, p_y real) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case p_kind
    when 'lounge' then p_x >= 1 and p_x < 25 and p_y >= 1 and p_y < 10
    when 'office' then p_x >= 1 and p_x < 19 and p_y >= 1 and p_y < 11
  end, false)
$$;
drop function if exists public.lounge_pos_ok(real, real);

/*
 * 廣播到一間房。成本 = 這間房現在的人數(每個在場的人都會收到一則)。預算照舊
 * 以公司為單位 —— 同公司的休息室和各隊辦公室共用一份,一間被灌爆拖不垮別間公司。
 */
create or replace function public.lounge_emit(p_company uuid, p_topic text, p_event text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  select count(*) into n from public.lounge_members
   where topic = p_topic and seen_at > public.lounge_ms() - 60000;
  n := greatest(n, 1);
  if not public.lounge_take('global', n, 80, 200)
     or not public.lounge_take(p_company::text, n, 40, 120)
     or not public.lounge_day_add('global', n, 60000)
     or not public.lounge_day_add(p_company::text, n, 20000) then
    raise exception 'lounge busy';
  end if;
  begin
    perform realtime.send(p_payload, p_event, p_topic, true);
  exception when others then
    -- 當天的分割表要等當天第一條 websocket 連線才會建,在那之前 send 會失敗。
    -- 吞掉:動作本身已經寫進表裡,其他人下一次對帳(30 秒內)就會看到
    null;
  end;
end $$;
drop function if exists public.lounge_emit(uuid, text, jsonb);

-- 拿 session 換回自己那一列並鎖住。票不對 = 這個帳號在別的分頁/裝置重新進門了;
-- 已經離開、或換了公司/隊伍(房間的頻道名對不上了)都算不在
create or replace function public.lounge_seat(p_session uuid)
returns public.lounge_members
language plpgsql security definer set search_path = '' as $$
declare
  m public.lounge_members;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into m from public.lounge_members where user_id = auth.uid() for update;
  if not found then raise exception 'not in lounge'; end if;
  if m.session is distinct from p_session then raise exception 'session replaced'; end if;
  if m.seen_at = 0 or m.topic is distinct from public.lounge_topic(m.kind) then
    raise exception 'not in lounge';
  end if;
  return m;
end $$;

-- 收訊 policy 用:我現在所在房間的頻道名(在場、而且房間還對得上我的公司/隊伍)。
-- security definer —— lounge_members 對 client 完全不可讀
create or replace function public.lounge_my_topic() returns text
language sql security definer stable set search_path = '' as $$
  select m.topic from public.lounge_members m
   where m.user_id = auth.uid() and m.seen_at > public.lounge_ms() - 60000
     and m.topic = public.lounge_topic(m.kind)
$$;

-- ---------- 對外的 RPC ----------

-- 進門。p_kind:'lounge' 或 'office'(自己隊的,隊伍由伺服器看 profiles)。
-- 回傳 session(之後每個動作都要帶)、sid(它的公開代號)、topic(要訂閱的頻道)
create or replace function public.lounge_enter(p_kind text, p_x real, p_y real)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  t    bigint := public.lounge_ms();
  cc   uuid;
  h    text;
  av   text;
  tp   text;
  prev public.lounge_members;
  n    int;
  s    uuid := gen_random_uuid();
  sid  text := left(md5(s::text), 8);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind is null or p_kind not in ('lounge', 'office') then raise exception 'bad room'; end if;
  select company_code, handle, avatar into cc, h, av from public.profiles where user_id = uid;
  if cc is null then raise exception 'no company'; end if;
  if not public.lounge_pos_ok(p_kind, p_x, p_y) then raise exception 'bad position'; end if;
  tp := public.lounge_topic(p_kind);

  -- 進門也限速:不然狂按進出就是在洗 join 廣播。離開不刪列,所以「離開再進」也算
  select * into prev from public.lounge_members where user_id = uid for update;
  if prev.user_id is not null and t - prev.joined_at < 3000 then raise exception 'too fast'; end if;

  select count(*) into n from public.lounge_members
   where topic = tp and seen_at > t - 60000 and user_id <> uid;
  if n >= 30 then raise exception 'lounge full'; end if;

  insert into public.lounge_members
    (user_id, company_code, kind, topic, session, x, y, dir, joined_at, moved_at, acted_at, seen_at)
  values (uid, cc, p_kind, tp, s, p_x, p_y, 'down', t, t, 0, t)
  on conflict (user_id) do update set
    company_code = excluded.company_code, kind = excluded.kind, topic = excluded.topic,
    session = excluded.session, x = excluded.x, y = excluded.y, dir = excluded.dir,
    joined_at = excluded.joined_at, moved_at = excluded.moved_at, seen_at = excluded.seen_at;

  -- 從另一間走過來的:那間的人要看到你離開。前端換畫面時也會送 leave,但兩個請求
  -- 誰先到不一定 —— 進門先到的話,那個 leave 拿的是舊票,會什麼都不做
  if prev.user_id is not null and prev.seen_at > t - 60000 and prev.topic <> tp then
    begin
      perform public.lounge_emit(prev.company_code, prev.topic, 'leave', jsonb_build_object('uid', uid));
    exception when others then
      null; -- 預算不夠也要讓人換房間;那間的人 60 秒內對帳會看到
    end;
  end if;

  -- 暱稱與造型從 profiles 拿,不收 client 自報的 —— 冒充不了別人的名字
  perform public.lounge_emit(cc, tp, 'join', jsonb_build_object(
    'uid', uid, 'sid', sid, 'handle', h, 'avatar', av, 'x', p_x, 'y', p_y, 'dir', 'down'));
  return json_build_object('session', s, 'sid', sid, 'topic', tp);
end $$;

-- v15 的進門(只有休息室)。轉接給還沒重新整理的舊版前端,之後的遷移再拿掉
create or replace function public.lounge_join(p_x real, p_y real)
returns json
language sql set search_path = '' as
$$ select public.lounge_enter('lounge', p_x, p_y) $$;

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
  if not public.lounge_pos_ok(m.kind, p_x, p_y) then raise exception 'bad position'; end if;
  -- 一秒最多 4 則,給網路抖動讓兩則擠在一起的餘裕
  if t - m.moved_at < 250 then raise exception 'too fast'; end if;
  -- 不能瞬移:走路 5 格/秒,放寬到 7 格/秒 + 1.5 格
  if sqrt(power(p_x - m.x, 2) + power(p_y - m.y, 2)) > (t - m.moved_at) * 7.0 / 1000 + 1.5 then
    raise exception 'too far';
  end if;
  update public.lounge_members
     set x = p_x, y = p_y, dir = p_dir, moved_at = t, seen_at = t
   where user_id = m.user_id;
  perform public.lounge_emit(m.company_code, m.topic, 'move', jsonb_build_object(
    'uid', m.user_id, 'x', p_x, 'y', p_y, 'dir', p_dir));
end $$;

-- 離開。票不對(別的分頁已經接手)或已經離開就什麼都不做。
-- 不刪列,只把 seen_at 歸零:不算在場、收不到廣播,但 joined_at 還在,三秒限制才有效。
-- pg_cron(v15 的 lounge-prune)一小時後清掉
create or replace function public.lounge_leave(p_session uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.lounge_members;
begin
  update public.lounge_members set seen_at = 0
   where user_id = auth.uid() and session = p_session and seen_at > 0
  returning * into m;
  if m.user_id is null then return; end if;
  begin
    perform public.lounge_emit(m.company_code, m.topic, 'leave', jsonb_build_object('uid', m.user_id));
  exception when others then
    null; -- 預算不夠也要讓人離開;別人 60 秒內對帳會看到
  end;
end $$;

-- 聊天。限制跟 v15 一樣(剝隱形字元、3 秒一則、一天 150 則、不能重複、禁言),
-- 只是記在這間房、廣播到這間房
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
  insert into public.lounge_chat (id, company_code, topic, user_id, handle, body, at)
  values (mid, m.company_code, m.topic, m.user_id, h, clean, t);
  update public.lounge_members set seen_at = t where user_id = m.user_id;
  perform public.lounge_emit(m.company_code, m.topic, 'say', jsonb_build_object(
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
  perform public.lounge_emit(m.company_code, m.topic, 'emote', jsonb_build_object(
    'uid', m.user_id, 'emoji', p_emoji));
end $$;

-- 對帳:這間房現在誰在、最近 50 則聊天、我被禁言到幾點。房間由伺服器從 profiles
-- 算 —— 只拿得到休息室和自己隊辦公室的,別隊的辦公室在聊什麼查不到
create or replace function public.lounge_snapshot(p_kind text)
returns json
language plpgsql security definer stable set search_path = '' as $$
declare
  tp text := public.lounge_topic(p_kind);
  t  bigint := public.lounge_ms();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind is null or p_kind not in ('lounge', 'office') then raise exception 'bad room'; end if;
  if tp is null then raise exception 'no company'; end if;
  return json_build_object(
    'members', coalesce((
      select json_agg(json_build_object(
               'uid', m.user_id, 'sid', left(md5(m.session::text), 8),
               'handle', p.handle, 'avatar', p.avatar,
               'x', m.x, 'y', m.y, 'dir', m.dir) order by m.joined_at)
        from public.lounge_members m
        join public.profiles p on p.user_id = m.user_id
       where m.topic = tp and m.seen_at > t - 60000), '[]'::json),
    'chat', coalesce((
      select json_agg(c order by c.at)
        from (select id, user_id as uid, handle, body, at
                from public.lounge_chat
               where topic = tp and at > t - 86400000
               order by at desc limit 50) c), '[]'::json),
    'mutedUntil', (select until_at from public.lounge_mutes
                    where user_id = auth.uid() and until_at > t)
  );
end $$;

-- v15 的對帳(只有休息室)。轉接給舊版前端
create or replace function public.lounge_state()
returns json
language sql stable set search_path = '' as
$$ select public.lounge_snapshot('lounge') $$;

-- ---------- 權限 ----------

revoke execute on function
  public.lounge_topic(text),
  public.lounge_pos_ok(text, real, real),
  public.lounge_emit(uuid, text, text, jsonb)
  from public, anon, authenticated;

revoke execute on function
  public.lounge_my_topic(),
  public.lounge_enter(text, real, real),
  public.lounge_snapshot(text)
  from public, anon;
grant execute on function
  public.lounge_my_topic(),
  public.lounge_enter(text, real, real),
  public.lounge_snapshot(text)
  to authenticated;

-- ---------- 即時頻道的收訊權限 ----------
-- 只收得到「我現在所在那一間」的廣播:休息室 = 同公司、辦公室 = 同公司同隊,
-- 而且人要在場。刻意沒有 insert policy:瀏覽器不能自己廣播,也不能自報 presence。
drop policy if exists "lounge members receive" on realtime.messages;
create policy "lounge members receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = public.lounge_my_topic()
  );
drop function if exists public.lounge_is_member();
