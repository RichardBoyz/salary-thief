import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// 跟 public/_headers 同一份(部署層再疊一次)。改一邊要改兩邊。
// script-src 'self':prod 全是 external chunk,擋掉任何注入的腳本。
// style-src 需要 'unsafe-inline' 因為 React 的 style={{...}} 是 inline。
// connect-src 白名單:XSS 後資料也只能流向 Supabase,外洩不出去。
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; " +
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
  "object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

// 只在 build 注入 CSP meta —— dev 注入會擋掉 Vite 的 HMR inline script
const injectCsp = (): Plugin => ({
  name: "inject-csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
      injectTo: "head-prepend",
    },
  ],
});

export default defineConfig({
  plugins: [react(), tailwindcss(), injectCsp()],
  server: {
    // dev 版的 worker.js:/gcis/* 轉發到經濟部商工登記 API(gcis 不給 CORS)
    proxy: {
      "/gcis": {
        target: "https://data.gcis.nat.gov.tw",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gcis/, ""),
      },
    },
  },
});
