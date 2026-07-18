-- v4:安全加固。用法:跑過 v2/v3 後,SQL Editor 貼上 → Run 一次。
--
-- 修三個 RLS 完整性漏洞(攻擊者視角:拿自己合法的 JWT 對 API 寫惡意資料):
--   1. company_code 可任意塞 → 跨公司污染別人的排行榜資料池
--   2. slack_events 單筆時長無上限 → 一個 insert 塞「一兆毫秒」直接封頂排行榜
--   3. reactions 可對同一個 event 無限灌同一種 emoji → 洗版 + 撐爆表
--
-- 前兩者的 client 端也有第二道防線(unionMs 對重疊求 union、UI 夾制),
-- 但 API 是真正的信任邊界,防線要在 DB。

-- ---------- 1 + 2:slack_events 完整性 ----------
-- company_code 必須是「呼叫者自己公司」(或都 null);時長非負且 <= 24h。
-- not distinct from 處理 null=null:沒建 profile 的人只能塞 null。

alter table public.slack_events
  add constraint slack_events_duration check (
    ended_at is null
    or (ended_at >= started_at and ended_at - started_at <= 86400000)
  ) not valid;  -- not valid:不追溯既有資料,只擋新寫入,避免遷移被髒資料卡住

drop policy "insert own" on public.slack_events;
drop policy "close own" on public.slack_events;

create policy "insert own" on public.slack_events for insert
  with check (
    user_id = auth.uid()
    and company_code is not distinct from public.my_company()
  );
create policy "close own" on public.slack_events for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and company_code is not distinct from public.my_company()
  );

-- ---------- 3:reactions 防灌水 + 完整性 ----------
-- 先清掉可能存在的重複(生產目前幾乎沒有),再上 unique。
delete from public.reactions a using public.reactions b
where a.ctid < b.ctid
  and a.event_id = b.event_id
  and a.from_user = b.from_user
  and a.emoji = b.emoji;

alter table public.reactions
  add constraint reactions_once unique (event_id, from_user, emoji);

drop policy "insert as self" on public.reactions;
create policy "insert as self" on public.reactions for insert
  with check (
    from_user = auth.uid()
    and company_code is not distinct from public.my_company()
  );

-- ---------- catches 完整性 ----------
-- caught_at/時間視窗已由 trigger 管死,只差 company_code 沒綁。
drop policy "insert own" on public.catches;
create policy "insert own" on public.catches for insert
  with check (
    user_id = auth.uid()
    and company_code is not distinct from public.my_company()
  );

-- ---------- 收斂函式暴露面 ----------
-- validate_catch 是 trigger 函式,不該能被當 RPC 直接呼叫。
revoke execute on function public.validate_catch() from public, anon, authenticated;
