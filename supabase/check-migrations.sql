-- 哪幾份遷移跑過了?唯讀,不改任何東西。SQL Editor 貼上 → Run。
--
-- 每份挑兩個「只有那份會建出來」的東西(函式 + 欄位/表/約束),兩個都在
-- 才算 true —— 避免某份跑到一半失敗被誤判成跑完。
--
-- v2 顯示 true 但你沒跑過 migrate-v2.sql 是正常的:schema.sql 本身就已經是
-- v2 形狀(company_code / team / my_company),全新專案不需要跑 migrate-v2。

select 'v2 公司階層' as "遷移",
       to_regprocedure('public.my_company()') is not null
   and exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'team') as "已跑"
union all
select 'v3 魚點',
       to_regclass('public.catches') is not null
   and to_regprocedure('public.my_spots()') is not null
union all
select 'v4 安全加固',
       exists (select 1 from pg_constraint where conname = 'slack_events_duration')
   and exists (select 1 from pg_constraint where conname = 'reactions_once')
union all
select 'v5 公司統計',
       to_regprocedure('public.company_rankings(bigint,bigint)') is not null
   and exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'employment')
union all
select 'v8 摸魚幣',
       to_regclass('public.zone_points') is not null
   and to_regprocedure('public.sync_zone_points(int)') is not null
union all
select 'v9 股市',
       to_regclass('public.stocks') is not null
   and to_regprocedure('public.buy_stock(text,int)') is not null
union all
select 'v10 全市場搜尋',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'stocks'
                 and column_name = 'featured')
union all
select 'v11 留言板 + 灌列防線',
       to_regclass('public.messages') is not null
   and to_regprocedure('public.post_message(text)') is not null
   and exists (select 1 from pg_trigger where tgname = 'slack_events_row_cap')
union all
select 'v12 留言板綁房間',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'messages'
                 and column_name = 'team');
