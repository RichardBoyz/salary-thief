import { memo } from "react";
import { COLS, RAW, ROWS, TILE, tileAt } from "./map";
import { ART, CHAIR, PANTRY, PROP_COLORS, PROPS, RUG } from "./props";
import { PIXEL, runs, type Run } from "./sprite";

/*
 * 辦公室的靜態部分:地板、牆、牆上裝飾、家具。整個房間只畫一次(memo,沒有
 * props),Office 每 100ms 重畫也不會碰到這裡。
 *
 * 地板和牆是一張 SVG(z=0,永遠在最底);家具是各自絕對定位的小 SVG,
 * z-index = 底邊列數 × 10,跟角色(腳底 y × 10)排在同一條軸上 ——
 * 站在桌子後面的人會被桌子擋住腳,站在前面的人擋住桌子。
 *
 * 全部用 art 像素座標(一格 16),畫面放大 2 倍:跟角色同一個像素密度。
 */

const W = COLS * ART;
const H = ROWS * ART;

/** 一組色塊。runs 已經把同色橫向合併,這裡只負責上色;給 fill 就整組塗同一色 */
const Rects = ({ list, fill }: { list: Run[]; fill?: string }) =>
  list.map((r) => (
    <rect
      key={`${r.x},${r.y}`}
      x={r.x}
      y={r.y}
      width={r.w}
      height={1}
      fill={fill ?? PROP_COLORS[r.ch]}
    />
  ));

const CHAIR_RUNS = runs(CHAIR);

const FADES = new Set(["px-screen", "px-led"]);

/** 會動的小零件:咖啡熱氣、飲水機氣泡。[代號, x, y, w, h, 顏色, class] */
const FX: Record<string, [number, number, number, number, string, string][]> = {
  D: [[13, 8, 1, 2, "#9aa0ad", "px-steam"]],
  C: [[7, 5, 1, 1, "#ecf8ff", "px-bubble"]],
};

function Prop({ ch, x, y }: { ch: string; x: number; y: number }) {
  const prop = PROPS[ch];
  const w = prop.art[0].length;
  const h = prop.art.length;
  // 依動畫 class 分組:同組包一個 <g> 整組動(盆栽整叢搖,不是每片葉子各抖各的)
  const groups = new Map<string, Run[]>();
  for (const r of runs(prop.art)) {
    const cls = prop.anim?.[r.ch] ?? "";
    groups.set(cls, [...(groups.get(cls) ?? []), r]);
  }
  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={w * PIXEL}
      height={h * PIXEL}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{
        transform: `translate(${x * TILE}px, ${(y + 1) * TILE - h * PIXEL}px)`,
        zIndex: (y + 1) * 10,
      }}
    >
      {[...groups].map(([cls, list]) => (
        <g key={cls}>
          {/* 閃爍類動畫改的是透明度:底下墊一層描邊色,變暗時才是「暗下來」,
              不是透出後面的地板 */}
          {FADES.has(cls) && <Rects list={list} fill={PROP_COLORS.k} />}
          <g className={cls || undefined}>
            <Rects list={list} />
          </g>
        </g>
      ))}
      {/* delay 用格子座標打散 —— 四張桌子同步冒煙會很假 */}
      {FX[ch]?.map(([fx, fy, fw, fh, color, cls]) => (
        <rect
          key={cls}
          className={cls}
          x={fx}
          y={fy}
          width={fw}
          height={fh}
          fill={color}
          style={{ animationDelay: `${((x + y) % 4) * 0.7}s` }}
        />
      ))}
    </svg>
  );
}

/** 木地板:3 種木色的長條,接縫錯開。<pattern> 是瀏覽器原生的平鋪,整片地板 1 個 rect */
function Planks() {
  const tones = ["#5f4636", "#674c3a", "#5a4233", "#634937"];
  return (
    <pattern id="px-wood" width={48} height={16} patternUnits="userSpaceOnUse">
      {tones.map((c, i) => (
        <g key={i}>
          <rect x={0} y={i * 4} width={48} height={3} fill={c} />
          <rect x={0} y={i * 4 + 3} width={48} height={1} fill="#47342a" />
          {[(i * 13 + 5) % 24, ((i * 13 + 5) % 24) + 24].map((jx) => (
            <rect key={jx} x={jx} y={i * 4} width={1} height={3} fill="#4b372b" />
          ))}
          {/* 木紋小點,不然一整片太乾淨 */}
          <rect x={(i * 17 + 9) % 48} y={i * 4 + 1} width={3} height={1} fill="#6e5341" />
        </g>
      ))}
    </pattern>
  );
}

function WallDecor() {
  return (
    <g>
      {/* 兩扇窗,雲一格一格飄過去。clipPath 讓雲只在窗框內出現 */}
      {[2, 16].map((col) => {
        const x = col * ART + 2;
        return (
          <g key={col}>
            <clipPath id={`px-win${col}`}>
              <rect x={x} y={2} width={28} height={8} />
            </clipPath>
            <rect x={x - 1} y={1} width={30} height={10} fill="#4a3a2e" />
            <rect x={x} y={2} width={28} height={8} fill="#3d6c9e" />
            <rect x={x} y={7} width={28} height={3} fill="#5c8fbf" />
            <g clipPath={`url(#px-win${col})`}>
              <g className="px-cloud" style={{ animationDelay: `${-col}s` }}>
                <rect x={x - 12} y={4} width={7} height={2} fill="#e9eef5" />
                <rect x={x - 10} y={3} width={3} height={1} fill="#e9eef5" />
              </g>
            </g>
            {/* 窗框中柱與窗台 */}
            <rect x={x + 13} y={2} width={2} height={8} fill="#4a3a2e" />
            <rect x={x - 2} y={10} width={32} height={2} fill="#7b5637" />
          </g>
        );
      })}

      {/* 時鐘。秒針 steps(60):一秒跳一格,那正是真實秒針的動作 */}
      <g transform={`translate(${9 * ART + 8}, 6)`}>
        <rect x={-5} y={-4} width={10} height={8} fill="#1d1720" />
        <rect x={-4} y={-5} width={8} height={10} fill="#1d1720" />
        <rect x={-4} y={-3} width={8} height={6} fill="#ece8df" />
        <rect x={-3} y={-4} width={6} height={8} fill="#ece8df" />
        <rect x={-1} y={-1} width={3} height={1} fill="#1d1720" />
        <rect className="px-hand" x={0} y={-3} width={1} height={3} fill="#c4564f" />
      </g>

      {/* 冷氣:出風口 + 一顆會閃的運轉燈 */}
      <g>
        <rect x={12 * ART + 1} y={1} width={30} height={9} fill="#1d1720" />
        <rect x={12 * ART + 2} y={2} width={28} height={7} fill="#e6e3dc" />
        <rect x={12 * ART + 4} y={6} width={22} height={1} fill="#9a968e" />
        <rect x={12 * ART + 4} y={8} width={22} height={1} fill="#9a968e" />
        <rect className="px-led" x={12 * ART + 26} y={3} width={2} height={1} fill="#8fe07a" />
      </g>
    </g>
  );
}

function Floor() {
  return (
    <svg
      className="absolute top-0 left-0"
      width={COLS * TILE}
      height={ROWS * TILE}
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
    >
      <defs>
        <Planks />
        <pattern id="px-tiles" width={8} height={8} patternUnits="userSpaceOnUse">
          <rect width={8} height={8} fill="#3d424d" />
          <rect width={7} height={7} fill="#4a505c" />
          <rect width={7} height={1} fill="#535a67" />
        </pattern>
        <pattern id="px-paper" width={6} height={16} patternUnits="userSpaceOnUse">
          <rect width={6} height={16} fill="#2f3b50" />
          <rect width={1} height={16} fill="#36445c" />
        </pattern>
      </defs>

      {/* 地板:木頭為主,茶水間磁磚,沙發前一塊地毯 */}
      <rect x={ART} y={ART} width={W - 2 * ART} height={H - 2 * ART} fill="url(#px-wood)" />
      <rect
        x={PANTRY.x * ART}
        y={PANTRY.y * ART}
        width={PANTRY.w * ART}
        height={PANTRY.h * ART}
        fill="url(#px-tiles)"
      />
      <rect
        x={RUG.x * ART}
        y={RUG.y * ART + 4}
        width={RUG.w * ART}
        height={RUG.h * ART - 4}
        fill="#2f4656"
      />
      <rect
        x={RUG.x * ART + 2}
        y={RUG.y * ART + 6}
        width={RUG.w * ART - 4}
        height={RUG.h * ART - 8}
        fill="#3a5869"
        stroke="#6f93a6"
        strokeWidth={1}
        strokeDasharray="2 2"
      />

      {/* 窗光斜斜灑在地上。透明度很低 —— 是氣氛,不是聚光燈 */}
      {[2, 16].map((col) => (
        <polygon
          key={col}
          points={`${col * ART + 2},${ART} ${col * ART + 30},${ART} ${col * ART + 46},${ART * 4} ${col * ART + 18},${ART * 4}`}
          fill="#fff3d6"
          opacity={0.06}
        />
      ))}

      {RAW.flatMap((row, y) =>
        [...row].map((ch, x) => {
          const px = x * ART;
          const py = y * ART;
          const parts = [];
          // 桌子正下方那格放椅子
          if (tileAt({ x, y: y - 1 }) === "D")
            parts.push(
              <g key="chair" transform={`translate(${px}, ${py})`}>
                <Rects list={CHAIR_RUNS} />
              </g>,
            );
          // 功能標記:綠 = 你的座位(回來就是上班),金 = 摸魚區
          if (ch === "y" || ch === "b")
            parts.push(
              <rect
                key="mark"
                x={px + 0.5}
                y={py + 0.5}
                width={ART - 1}
                height={ART - 1}
                fill={ch === "y" ? "rgba(127,200,96,.10)" : "rgba(232,194,100,.12)"}
                stroke={ch === "y" ? "rgba(127,200,96,.55)" : "rgba(232,194,100,.5)"}
                strokeDasharray="2 1"
              />,
            );
          return parts.length ? <g key={`${x},${y}`}>{parts}</g> : null;
        }),
      )}

      {/* 牆:上面那道看得到牆面(壁紙 + 護牆板),左右下只看得到牆頂 */}
      <rect x={0} y={0} width={W} height={ART} fill="url(#px-paper)" />
      <rect x={0} y={11} width={W} height={1} fill="#7b5f48" />
      <rect x={0} y={12} width={W} height={3} fill="#5a4636" />
      <rect x={0} y={15} width={W} height={1} fill="#2b211a" />
      <rect x={0} y={ART} width={W} height={2} fill="#000" opacity={0.25} />
      {[0, W - ART].map((x) => (
        <rect key={x} x={x} y={0} width={ART} height={H} fill="#1c2029" />
      ))}
      <rect x={0} y={H - ART} width={W} height={ART} fill="#1c2029" />
      <rect x={ART - 1} y={ART} width={1} height={H - 2 * ART} fill="#2c3240" />
      <rect x={W - ART} y={ART} width={1} height={H - 2 * ART} fill="#2c3240" />
      <rect x={ART} y={H - ART} width={W - 2 * ART} height={1} fill="#2c3240" />
      <rect x={ART} y={ART} width={2} height={H - 2 * ART} fill="#000" opacity={0.18} />
      <WallDecor />
    </svg>
  );
}

/** 整個房間。Office 把角色跟它疊在同一個定位容器裡,z-index 才排得到一起 */
export default memo(function Scene() {
  return (
    <>
      <Floor />
      {RAW.flatMap((row, y) =>
        [...row].map((ch, x) => {
          if (!PROPS[ch]) return null;
          if (ch === "S" && tileAt({ x: x - 1, y }) === "S") return null; // 沙發只畫一次
          const art = ch === "C" && tileAt({ x: x - 1, y }) === "C" ? "c" : ch;
          return <Prop key={`${x},${y}`} ch={art} x={x} y={y} />;
        }),
      )}
    </>
  );
});
