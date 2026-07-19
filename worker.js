// 唯一的 Worker 程式碼:把 /gcis/* 轉發到經濟部商工登記 API。
// gcis 不給 CORS,瀏覽器到不了,只能繞過自己家。靜態資產照舊由平台先出,
// 只有非資產路徑(= /gcis/*)才會進到這裡。
//
// 只轉發這一個 dataset 路徑 —— 不當整個 gov API 的開放代理。
const GCIS = "https://data.gcis.nat.gov.tw";
const ALLOW = "/gcis/od/data/api/6BBA2268-1367-4B42-9CCA-BC17499EBE8C";

export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method !== "GET" || !url.pathname.startsWith(ALLOW)) {
      return new Response("Not found", { status: 404 });
    }
    const res = await fetch(GCIS + url.pathname.slice("/gcis".length) + url.search, {
      // ponytail: 同查詢快取 1 小時,省 gcis 的 IP 配額。公司登記資料
      // 本來就不是即時的,配額真的不夠再加自己的限流。
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    // 重新包一層:丟掉 gcis 的 Set-Cookie(JSESSIONID),只留 JSON 本體
    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "cache-control": "public, max-age=3600",
      },
    });
  },
};
