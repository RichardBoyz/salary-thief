-- v10:全市場入庫 + 搜尋。用法:跑過 v9 後,SQL Editor 貼上 → Run 一次。
--
-- v9 只留五檔寫死的標的,使用者看不到也搜不到其他股票。修法不是去打新的
-- API —— **每天抓的 STOCK_DAY_ALL 本來就是全市場**,v9 解析時把 99.5% 丟掉了。
-- 改成整批寫進來,一千多列大約 100~200 KB,對 500MB 的免費額度是零頭,
-- 搜尋因此不需要任何額外的網路請求。
--
-- featured:預設顯示的那幾檔。沒有它的話股市頁一開是一千多列,既難看也
-- 浪費出站流量 —— 頁面只載 featured + 你持有的,其他靠搜尋。

alter table public.stocks
  add column if not exists featured boolean not null default false;

update public.stocks set featured = true
 where symbol in ('2330', '2317', '2454', '2002', '2603');

-- 只有 featured 的那幾列會被列出來,部分索引比全表索引小得多
create index if not exists stocks_featured on public.stocks (featured) where featured;

/*
 * 整批 upsert 全市場,而不是只 update 既有的五列。
 *
 * on conflict 刻意不碰 featured —— 它是人挑的,不該被每日排程覆寫。
 */
create or replace function private.refresh_stock_prices() returns int
language plpgsql security definer set search_path = '' as $$
declare
  body json;
  rid  bigint;
  n    int := 0;
begin
  select r.id, r.content::json into rid, body
    from private.price_request q
    join net._http_response r on r.id = q.id
   where r.status_code = 200
   order by q.requested_at desc
   limit 1;
  if body is null then return 0; end if;

  insert into public.stocks (symbol, name, close_ntd, trade_date, updated_at)
  select e ->> 'Code',
         e ->> 'Name',
         (e ->> 'ClosingPrice')::numeric,
         -- Date 是民國曆(1150804 = 2026-08-04),前三碼 +1911 轉西元
         to_date(((substring(e ->> 'Date', 1, 3))::int + 1911)::text
                   || substring(e ->> 'Date', 4), 'YYYYMMDD'),
         now()
    from json_array_elements(body) e
   -- 停牌那天證交所給的是 '--' 之類的字串,擋掉才不會讓整批寫入炸掉
   where (e ->> 'ClosingPrice') ~ '^[0-9]+(\.[0-9]+)?$'
     and (e ->> 'ClosingPrice')::numeric > 0
     and coalesce(e ->> 'Code', '') <> ''
     and coalesce(e ->> 'Name', '') <> ''
  on conflict (symbol) do update
    set name       = excluded.name,
        close_ntd  = excluded.close_ntd,
        trade_date = excluded.trade_date,
        updated_at = now();
  get diagnostics n = row_count;

  -- 解析完立刻把回應丟掉:一次好幾百 KB,留著是拿資料庫空間存垃圾
  delete from net._http_response where id = rid;
  delete from private.price_request where requested_at < now() - interval '7 days';
  return n;
end $$;

revoke execute on function private.refresh_stock_prices() from public, anon, authenticated;
