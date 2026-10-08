-- v14:自訂角色外觀。用法:跑過 v12 後,SQL Editor 貼上 → Run 一次。
--
-- 一個欄位就夠,不開新表:profiles 一人一列,不會長列(「列數怎麼封頂」在這裡
-- 天生成立);寫入走既有的 "update self" policy,只改得到自己那一列。
--
-- 值是 6 個 base36 字元 —— 髮型/髮色/膚色/上衣/褲子/領帶各選第幾個
-- (src/office/sprite.ts 的 encodeAvatar)。check 把格式鎖死:這欄不是自由文字,
-- 塞不進名字、網址或任何別的東西;不存圖片,也就沒有上傳與審查的問題。
-- 編號超出選項範圍時 client 當作沒自訂,畫 userId 雜湊出來的預設臉。
-- null = 沒自訂。

alter table public.profiles
  add column if not exists avatar text
  check (avatar is null or avatar ~ '^[0-9a-z]{6}$');
