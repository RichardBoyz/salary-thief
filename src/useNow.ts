import { useEffect, useState } from "react";

/**
 * 每 100ms 重讀一次時鐘。
 *
 * 這裡的 setInterval 只負責「叫 React 重畫」,不負責算錢 —— 錢是 money.ts
 * 從 now 推導的。所以瀏覽器把背景分頁的計時器降頻到每秒一次也無所謂,
 * 切回來的第一次 tick 就是正確數字。
 *
 * 為什麼是 100ms 而不是 rAF:金額只顯示到小數點後兩位,每秒大約變 8 次,
 * 60fps 等於把同樣的數字重畫 52 次。這個 app 會被開著一整天,不值得為了
 * 看不出來的滑順度燒一整天的 CPU。
 */
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  return now;
}
