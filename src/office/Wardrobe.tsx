import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../strings";
import Actor, { PROFILE, SIT, STAND } from "./Actor";
import {
  AVATAR_SLOTS,
  HAIRS,
  lookOf,
  shapeRuns,
  SWATCHES,
  type Avatar,
  type Look,
} from "./sprite";

/** 伺服器錯誤 → 看得懂的文案。沒跑 v14 遷移時 PostgREST 會說找不到 avatar 欄位 */
const errText = (msg: string): string =>
  msg === "no profile" ? t.avatarNeedProfile : msg.includes("avatar") ? t.avatarNotReady : msg;

/** 預覽三面:正面、側面、背面 —— 換完一眼看全身,不用自己在房間裡繞一圈 */
const VIEWS = [STAND, PROFILE, SIT];

/** 髮型按鈕裡的小頭像:只畫頭那 12 列,用目前選的髮色跟膚色 */
function Head({ look }: { look: Look }) {
  return (
    <svg width={32} height={24} viewBox="0 0 16 12" shapeRendering="crispEdges">
      {shapeRuns(look.hair, "down", 0)
        .filter((r) => r.y < 12)
        .map((r) => (
          <rect
            key={`${r.x},${r.y}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={1}
            fill={look.colors[r.ch]}
          />
        ))}
    </svg>
  );
}

/** 一列選項。放在元件外面:定義在裡面的話每次重畫都是新元件,按鈕會被重建、焦點會掉 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[2.5em] shrink-0 px-small text-crt-dim">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** 一個選項。選中的凹下去 + 金框 —— 跟全 app 的「按下去」同一個語言 */
function Opt({
  on,
  label,
  color,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  color?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`grid min-h-8 min-w-8 cursor-pointer place-items-center text-crt-dim ${
        on ? "px-bevel-in outline-2 outline-offset-2 outline-crt-gold" : "px-bevel"
      }`}
      style={{ background: color }}
    >
      {children}
    </button>
  );
}

/**
 * 換裝。開在辦公室裡(跟留言板同一個位置),房間裡的你會即時換上正在挑的這套 ——
 * 不用另外想像穿起來在辦公室裡是什麼樣子。按「穿這套」才存,關掉就換回原本的。
 */
export default function Wardrobe({
  draft,
  onDraft,
  defaults,
  onSave,
  onClose,
}: {
  draft: Avatar;
  /** 收「改法」不收「結果」:連點兩個選項時,第二下不會拿到第一下之前的舊 draft */
  onDraft: (change: (a: Avatar) => Avatar) => void;
  /** 「預設」回到的樣子:userId 雜湊出來的那張臉 */
  defaults: Avatar;
  /** 回傳錯誤訊息,null = 存好了(呼叫端會關掉面板) */
  onSave: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const look = lookOf(draft);
  const pick = (k: keyof Avatar, v: number) => onDraft((a) => ({ ...a, [k]: v }));

  // 面板在地圖下方,手機上點了「換裝」卻什麼都沒看到(開在畫面外)是最糟的
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const save = async () => {
    setBusy(true);
    setErr(null);
    const e = await onSave();
    setBusy(false);
    if (e) setErr(errText(e));
  };

  const random = () =>
    onDraft(
      () =>
        Object.fromEntries(
          AVATAR_SLOTS.map(([k, n]) => [k, Math.floor(Math.random() * n)]),
        ) as Avatar,
    );

  // 在 render 裡讀 t:切換語言是原地換 t 的內容再整棵重畫,模組層級先讀好的字串不會跟著換
  const hairNames = [t.hairShort, t.hairBob, t.hairBun];
  // 領帶的第 0 個是「不打」(null),色票從 1 開始 —— 編號跟 Avatar.tie 一致
  const colorRows: [keyof Avatar, string, (string | null)[]][] = [
    ["hairColor", t.avatarHairColor, SWATCHES.hairColor],
    ["skin", t.avatarSkin, SWATCHES.skin],
    ["shirt", t.avatarShirt, SWATCHES.shirt],
    ["pants", t.avatarPants, SWATCHES.pants],
    ["tie", t.avatarTie, [null, ...SWATCHES.tie]],
  ];

  return (
    <div ref={panel} className="px-panel px-unroll flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-crt-white">{t.wardrobe}</span>
        <button onClick={onClose} className="px-btn">
          {t.close}
        </button>
      </div>

      {/* 墊辦公室木地板的顏色:角色的深色描邊放在近黑的面板底上會整個消失 */}
      <div className="px-bevel-in flex justify-center gap-6 py-3" style={{ background: "#5f4636" }}>
        {VIEWS.map((pose) => (
          <Actor key={pose.dir} look={look} pose={pose} scale={2} />
        ))}
      </div>

      <Row label={t.avatarHair}>
        {HAIRS.map((_, i) => (
          <Opt
            key={i}
            on={draft.hair === i}
            label={hairNames[i]}
            color="#5f4636"
            onClick={() => pick("hair", i)}
          >
            <Head look={lookOf({ ...draft, hair: i })} />
          </Opt>
        ))}
      </Row>

      {colorRows.map(([k, label, colors]) => (
        <Row key={k} label={label}>
          {colors.map((c, i) => (
            <Opt
              key={i}
              on={draft[k] === i}
              label={c ? `${label} ${k === "tie" ? i : i + 1}` : t.avatarNoTie}
              color={c ?? undefined}
              onClick={() => pick(k, i)}
            >
              {c ? null : "×"}
            </Opt>
          ))}
        </Row>
      ))}

      <div className="flex flex-wrap gap-2">
        <button onClick={random} className="px-btn">
          {t.avatarRandom}
        </button>
        <button onClick={() => onDraft(() => defaults)} className="px-btn">
          {t.avatarDefault}
        </button>
        <button onClick={save} disabled={busy} className="px-btn ml-auto text-crt-gold">
          {t.avatarSave}
        </button>
      </div>

      {err && <p className="px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{err}</p>}
      <p className="px-small text-crt-dim">{t.avatarHint}</p>
    </div>
  );
}
