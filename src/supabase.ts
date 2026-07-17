import { createClient } from "@supabase/supabase-js";

// anon key 是設計成公開的 —— 它本來就會隨 bundle 送進每一個訪客的瀏覽器。
// 擋資料的是 RLS(supabase/schema.sql),不是把 key 藏起來。寫死在這裡
// 省掉部署平台的環境變數設定,少一個會出錯的環節。
export const sb = createClient(
  "https://xpjrbnnlxoebkcyuzovx.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwanJibm5seG9lYmtjeXV6b3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDM0MjQsImV4cCI6MjA5OTg3OTQyNH0.SYc8CU9cnKlrLykTDcS7jS35xQC5lLqr5lh5W533efo",
);
