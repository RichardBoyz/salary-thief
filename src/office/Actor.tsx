import { memo, type CSSProperties } from "react";
import { PIXEL, shapeRuns, SPRITE_H, SPRITE_W, type Dir, type Look } from "./sprite";

export type Pose = { dir: Dir; flip: boolean; body: number; lift: boolean };

// 常用姿勢是常數 —— Actor 是 memo,每次 render 都新建物件的話 memo 就白做了
export const SIT: Pose = { dir: "up", flip: false, body: 0, lift: false };
export const STAND: Pose = { dir: "down", flip: false, body: 0, lift: false };
export const PROFILE: Pose = { dir: "side", flip: false, body: 0, lift: false };

/** svg 多一列給「收腳時身體提起 1px」的空間 */
export const ACTOR_W = SPRITE_W * PIXEL;
export const ACTOR_H = (SPRITE_H + 1) * PIXEL;

/**
 * 角色。inline SVG:顏色依每個人的 Look 套上去,形狀全場共用(shapeRuns 有快取)。
 * memo 很重要 —— Office 每 100ms 重畫一次(useNow),一個角色一百多個 rect。
 *
 * 眨眼不是另一張圖:上半眼那幾格掛 .px-eye,CSS 每幾秒把它的 fill 換成膚色
 * 一瞬間。delay 由呼叫端打散,全辦公室同時眨眼會很詭異。
 *
 * scale 只給換裝面板的大預覽用;辦公室裡一律 1,跟家具同一個像素密度。
 */
export default memo(function Actor({
  look,
  pose,
  ghost = false,
  blink = 0,
  scale = 1,
}: {
  look: Look;
  pose: Pose;
  ghost?: boolean;
  blink?: number;
  scale?: number;
}) {
  return (
    <svg
      width={ACTOR_W * scale}
      height={ACTOR_H * scale}
      viewBox={`0 -1 ${SPRITE_W} ${SPRITE_H + 1}`}
      shapeRendering="crispEdges"
      style={
        {
          display: "block",
          transform: pose.flip ? "scaleX(-1)" : undefined,
          opacity: ghost ? 0.45 : undefined,
          "--eye": look.colors.E,
          "--skin": look.colors.s,
          "--blink": `${-blink}s`,
        } as CSSProperties
      }
    >
      <rect x={3} y={22} width={10} height={2} fill="#000" opacity={0.28} />
      <rect x={2} y={22.5} width={12} height={1} fill="#000" opacity={0.28} />
      <g transform={pose.lift ? "translate(0,-1)" : undefined}>
        {shapeRuns(look.hair, pose.dir, pose.body).map((r) => (
          <rect
            key={`${r.x},${r.y}`}
            className={r.ch === "E" ? "px-eye" : undefined}
            x={r.x}
            y={r.y}
            width={r.w}
            height={1}
            fill={look.colors[r.ch]}
          />
        ))}
      </g>
    </svg>
  );
});

/** 名牌:頂在頭上,不擋腳下的格子(魚、綠框都在地上)。自己的是金色 */
export const NameTag = ({ name, me = false }: { name: string; me?: boolean }) => (
  <span
    className={`absolute bottom-full left-1/2 max-w-24 -translate-x-1/2 truncate bg-crt-deep/80 px-1 px-small leading-tight whitespace-nowrap ${
      me ? "text-crt-gold" : "text-crt-white"
    }`}
  >
    {name}
  </span>
);
