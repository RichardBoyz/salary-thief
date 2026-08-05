-- v9:股市模擬。用法:跑過 v2~v5、v8 後,SQL Editor 貼上 → Run 一次。
--
-- 設計三句話:
--   1. **價格由伺服器抓、伺服器蓋章**。client 只送「買 2330 一股」的意圖,
--      價格、費用、成交與否全在 DB 決定 —— 送假價格進來沒有任何用處。
--   2. **收入帳與資產帳分開**(CONTRIBUTING 隱私鐵律第 4 條):偷到的點數在
--      zone_points,交易在 trades,現金是「累積偷到 − 買進 + 賣出」算出來的,
--      不存餘額。所以帳永遠可稽核:算出負數就代表有人繞過 RPC 動過資料。
--   3. **每日收盤價,不是盤中即時**。證交所 OpenAPI 官方端點,一天抓一次。
--      大家同一個價,沒有搶快問題,也少掉一整類限流與時序問題。
--
-- ⚠ 費率與匯率在 src/stocks.ts 有一份一模一樣的常數(前端只做預覽試算)。
--   **DB 這份才算數。** 改任何一邊都要改另一邊,不然使用者看到的估價會跟
--   實際成交對不上。跨語言沒辦法共用常數,只能靠這行註解。

create schema if not exists private;   -- v3 已建過,冪等

-- ---------- 標的清單 + 最新收盤價(同一張表) ----------
-- 要換名單就改這張表的內容,cron 下一輪只會更新表裡有的 symbol。
-- close_ntd 可以是 null:第一次排程跑之前沒有價,那時候不准交易(不猜價)。
create table public.stocks (
  symbol     text primary key,
  name       text not null,
  close_ntd  numeric(12,2) check (close_ntd is null or close_ntd > 0),
  trade_date date,
  updated_at timestamptz
);

insert into public.stocks (symbol, name) values
  ('2330', '台積電'),
  ('2317', '鴻海'),
  ('2454', '聯發科'),
  ('2002', '中鋼'),
  ('2603', '長榮');

alter table public.stocks enable row level security;
-- 只給登入者讀。沒有任何寫入 policy —— 只有下面的 security definer 排程能寫
create policy "read stocks" on public.stocks for select
  using (auth.uid() is not null);

-- ---------- 交易紀錄(append-only) ----------
-- 資產帳刻意不上排行榜、也不跨公司可見:只看得到自己的。
create table public.trades (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  symbol    text not null references public.stocks(symbol),
  side      text not null check (side in ('buy', 'sell')),
  shares    int  not null check (shares > 0),
  -- 成交價與點數都是伺服器當下算的,不是 client 送的
  price_ntd numeric(12,2) not null check (price_ntd > 0),
  points    int  not null check (points >= 0),
  at        timestamptz not null default now()
);

alter table public.trades enable row level security;
create policy "select own trades" on public.trades for select
  using (user_id = auth.uid());
-- 沒有 insert/update/delete policy:唯一入口是 buy_stock / sell_stock。
-- 寫進去就不能改、不能刪 —— 跟漁獲一樣,不給滅證的機會。

create index trades_user_symbol on public.trades (user_id, symbol);

-- ---------- 帳:累積偷到、現在有多少現金 ----------
-- ⚠ 150 = src/money.ts 的 FISH_POINTS,兩邊要一起改
create function private.earned_points(uid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(points) from public.zone_points where user_id = uid), 0)
       + coalesce((select count(*) * 150 from public.catches where user_id = uid), 0)
$$;

/*
 * 可用摸魚幣 = 累積偷到 − 買進付出 + 賣出拿回。
 * 不存餘額就沒有「餘額被改掉」這種攻擊面,而且這個式子本身就是稽核公式。
 */
create function private.cash_points(uid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select private.earned_points(uid)
       - coalesce((select sum(points) from public.trades
                    where user_id = uid and side = 'buy'), 0)
       + coalesce((select sum(points) from public.trades
                    where user_id = uid and side = 'sell'), 0)
$$;

/** 給畫面用:我的現金。只查得到自己的(內部 auth.uid()) */
create function public.my_cash() returns bigint
language sql stable security definer set search_path = '' as $$
  select private.cash_points(auth.uid())
$$;

-- ---------- 買 / 賣 ----------
/*
 * 進位方向刻意都對使用者不利(買進 ceil、賣出 floor)。點數是整數,零頭
 * 只要往有利方向倒一次,寫個迴圈買一股賣一股就能無中生有刷點數。
 * 差額最多 1 點,但洞是關死的。src/stocks.ts 有同樣的斷言測試。
 */
create function public.buy_stock(p_symbol text, p_shares int)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  px   numeric;
  cost bigint;
  cash bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'shares must be positive'; end if;

  select close_ntd into px from public.stocks where symbol = p_symbol;
  -- 沒價就不准交易,不猜一個價格(第一次排程前、或該檔停牌)
  if px is null then raise exception 'no price for %', p_symbol; end if;

  cost := ceil(p_shares::numeric * px * 1.001425);   -- 手續費 0.1425%
  cash := private.cash_points(uid);
  if cost > cash then
    raise exception 'not enough points: need %, have %', cost, cash;
  end if;

  insert into public.trades (user_id, symbol, side, shares, price_ntd, points)
  values (uid, p_symbol, 'buy', p_shares, px, cost);

  return json_build_object('price', px, 'points', cost, 'cash', cash - cost);
end $$;

create function public.sell_stock(p_symbol text, p_shares int)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid      uuid := auth.uid();
  px       numeric;
  held     bigint;
  proceeds bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'shares must be positive'; end if;

  select close_ntd into px from public.stocks where symbol = p_symbol;
  if px is null then raise exception 'no price for %', p_symbol; end if;

  -- 持有量從交易紀錄推導。賣不能超過持有 = 結構上做不了空
  select coalesce(sum(case when side = 'buy' then shares else -shares end), 0)
    into held
    from public.trades where user_id = uid and symbol = p_symbol;
  if p_shares > held then
    raise exception 'not enough shares: have %', held;
  end if;

  -- 手續費 0.1425% + 證交稅 0.3%
  proceeds := floor(p_shares::numeric * px * (1 - 0.001425 - 0.003));

  insert into public.trades (user_id, symbol, side, shares, price_ntd, points)
  values (uid, p_symbol, 'sell', p_shares, px, proceeds);

  return json_build_object('price', px, 'points', proceeds,
                           'cash', private.cash_points(uid));
end $$;

revoke execute on function public.buy_stock(text, int)  from public, anon;
revoke execute on function public.sell_stock(text, int) from public, anon;
revoke execute on function public.my_cash()             from public, anon;
grant execute on function public.buy_stock(text, int)  to authenticated;
grant execute on function public.sell_stock(text, int) to authenticated;
grant execute on function public.my_cash()             to authenticated;

-- ---------- 每日抓價(pg_cron 排程 + pg_net 出網路) ----------
-- pg_net 是非同步的:送出跟收回是兩件事,所以拆成兩個排程 —— 先發請求,
-- 五分鐘後再解析。request id 記在 private,PostgREST 看不到。
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table private.price_request (
  id           bigint primary key,
  requested_at timestamptz not null default now()
);

create function private.refresh_stock_prices() returns int
language plpgsql security definer set search_path = '' as $$
declare
  body json;
  n    int := 0;
begin
  select r.content::json into body
    from private.price_request q
    join net._http_response r on r.id = q.id
   where r.status_code = 200
   order by q.requested_at desc
   limit 1;
  if body is null then return 0; end if;

  update public.stocks s
     set close_ntd  = (e ->> 'ClosingPrice')::numeric,
         -- Date 是民國曆(1150804 = 2026-08-04),前三碼 +1911 轉西元
         trade_date = to_date(
           ((substring(e ->> 'Date', 1, 3))::int + 1911)::text
             || substring(e ->> 'Date', 4), 'YYYYMMDD'),
         updated_at = now()
    from json_array_elements(body) e
   where e ->> 'Code' = s.symbol
     -- 停牌那天證交所給的是 '--' 之類的字串,擋掉才不會讓整批更新炸掉
     and (e ->> 'ClosingPrice') ~ '^[0-9]+(\.[0-9]+)?$'
     and (e ->> 'ClosingPrice')::numeric > 0;
  get diagnostics n = row_count;

  -- 只留最近幾筆請求紀錄,不然這張表會無限長
  delete from private.price_request where requested_at < now() - interval '7 days';
  return n;
end $$;

revoke execute on function private.refresh_stock_prices() from public, anon, authenticated;

-- 台股 13:30 收盤,行情檔約 14:00 後才齊。台北 14:30 = UTC 06:30,週一到五。
-- 一天一次就夠 —— 我們用的是收盤價,不是盤中報價。
select cron.schedule(
  'stocks-fetch', '30 6 * * 1-5',
  $$insert into private.price_request (id)
    select net.http_get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')$$
);
select cron.schedule(
  'stocks-parse', '35 6 * * 1-5',
  $$select private.refresh_stock_prices()$$
);
