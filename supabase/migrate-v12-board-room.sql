-- v12:留言板綁房間(隊伍),不再是全公司一塊板。跑過 v11 後貼上 → Run 一次。
--
-- 辦公室本來就是一隊一房,所以「這間辦公室的留言板」= 這一隊的留言板。
-- 可見範圍不變(RLS 仍然鎖同公司),多的只是房間分流。
--
-- team 由伺服器從 profiles 蓋章,**不是 client 送的** —— 不然任何人都能
-- 把訊息灌進別隊的板。串門子時你發的話一律留在自己房間,前端也把輸入框
-- 關掉:你是幽靈,別隊的牆不歸你寫。

alter table public.messages add column if not exists team text;

-- 房間分流之後,查詢條件是 (company_code, team, at) —— 舊索引吃不到 team
create index if not exists messages_room_at
  on public.messages (company_code, team, at desc);

create or replace function public.post_message(p_body text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  clean      text;
  h          text;
  cc         uuid;
  tm         text;
  last_at    timestamptz;
  last_body  text;
  today_n    int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  clean := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  if char_length(clean) = 0   then raise exception 'empty message'; end if;
  if char_length(clean) > 140 then raise exception 'message too long'; end if;

  -- 房間跟著發言者現在的隊走。client 不能指定,所以灌不進別隊的板
  select handle, company_code, team into h, cc, tm
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

  insert into public.messages (user_id, company_code, handle, team, body)
  values (uid, cc, h, tm, clean);

  return json_build_object('ok', true);
end $$;

revoke execute on function public.post_message(text) from public, anon;
grant  execute on function public.post_message(text) to authenticated;
