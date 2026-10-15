import { useEffect, useRef, useState } from "react";
import { companyName } from "../companies";
import Board from "../components/Board";
import { dur, pts } from "../fmt";
import { displayNames } from "../lounge";
import { points } from "../money";
import { dayKey } from "../slack";
import { useStore } from "../store";
import { t } from "../strings";
import {
  catchFish,
  saveAvatar,
  syncZonePoints,
  useRoom,
  useSession,
  useSpots,
  useTeam,
  type Spot,
} from "../sync";
import type { Standing } from "../team";
import { useNow } from "../useNow";
import Actor, { NameTag, SIT, STAND } from "./Actor";
import {
  bonusZoneAt,
  COLS,
  DOOR,
  OFFICE,
  OFFICE_DOOR,
  FLOOR_TILES,
  inBonusZone,
  ROWS,
  SPAWN_BREAK,
  SPAWN_DESK,
  SPAWN_DOOR,
  SPOTS,
  TILE,
  zoneAt,
  type Pos,
} from "./map";
import { ART, OFFICE_SCENE } from "./props";
import { Bubble, bubbles, ChatBar, ChatPanel, DoorSign, facingOf, PersonCard, Remote, Where } from "./Room";
import Scene from "./Scene";
import {
  decodeAvatar,
  defaultAvatar,
  encodeAvatar,
  lookFor,
  lookOf,
  type Avatar,
} from "./sprite";
import { actorAt, depth, useWalker } from "./useWalker";
import Wardrobe from "./Wardrobe";

/** server 給的亂數 → 地圖格子。位置純裝飾,可驗證的核心是時間視窗 */
const fishTile = (s: Spot): Pos => FLOOR_TILES[(s.r1 * 31 + s.r2) % FLOOR_TILES.length];

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * 不在這間的同事站哪:上班中 → 座位,摸魚中 → 茶水間,離線 → 不出現。位置由
 * 狀態推導(排行榜同一份輪詢資料)。人真的在辦公室裡的(即時房間,v16)不走這裡,
 * 照實際位置走動。userId 排序讓每個人的站位在兩次輪詢之間穩定,不會無故換位。
 */
function placeTeammates(rows: Standing[], me: string | undefined) {
  const others = rows
    .filter((r) => r.userId !== me && r.state !== "offline")
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const spots = { slacking: [...SPOTS.breaks], working: [...SPOTS.chairs] };
  const overflow = [...SPOTS.floor];
  return others.map((r) => ({
    ...r,
    pos: spots[r.state as "slacking" | "working"].shift() ?? overflow.shift() ?? SPOTS.floor[0],
  }));
}

/**
 * 牆上的留言板。點它就開 —— 留言板屬於「這間辦公室」,所以入口就在辦公室
 * 牆上,不是主畫面上的第八顆按鈕。
 *
 * stopPropagation 是必要的:地圖的點擊是 tap-to-move,不擋的話點白板會順便
 * 叫角色往牆上走(雖然 BFS 會因為目標不可走而回空陣列,但那是碰巧沒事,
 * 不是設計)。
 */
function BoardSign({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      title={t.board}
      aria-label={t.board}
      className="absolute top-0 left-0 z-[1] cursor-pointer"
      style={{ transform: `translate(${5 * TILE}px, 0px)` }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <svg
        className="block"
        width={TILE * 2}
        height={TILE}
        viewBox={`0 0 ${ART * 2} ${ART}`}
        shapeRendering="crispEdges"
      >
        <rect x={2} y={1} width={28} height={10} fill="#1d1720" />
        <rect x={3} y={2} width={26} height={8} fill="#ece8df" />
        <rect x={5} y={4} width={9} height={1} fill="#6f7684" />
        <rect x={5} y={6} width={14} height={1} fill="#6f7684" />
        <rect x={18} y={3} width={6} height={4} fill="#f2d16b" />
        <rect x={6} y={8} width={6} height={1} fill="#6f7684" />
        {/* 角落一顆會閃的圖釘 —— 不然沒人知道那塊板可以點 */}
        <rect className="px-led" x={26} y={3} width={2} height={2} fill="#e0625f" />
        <rect x={2} y={11} width={28} height={1} fill="#7b5637" />
      </svg>
    </button>
  );
}

export default function Office({
  onBack,
  onLounge,
  atDoor,
}: {
  onBack: () => void;
  onLounge: () => void;
  /** 從休息室走門回來:站在門口,不是座位 */
  atDoor: boolean;
}) {
  const activeSince = useStore((s) => s.activeSince);
  const startSlacking = useStore((s) => s.startSlacking);
  const stopSlacking = useStore((s) => s.stopSlacking);
  const zoneMs = useStore((s) => s.zoneMs);
  const addZoneMs = useStore((s) => s.addZoneMs);
  const now = useNow();
  const session = useSession();
  const team = useTeam(45_000); // 沒登入回傳 null,辦公室就是單人版

  // 一隊一房。你預設在自己隊的房間;串門子 = 切到別隊房間旁觀。
  // 房間清單 = 公司裡實際存在的隊(有沒選隊的人就多一間大廳)。
  const myTeam = team?.profile?.team ?? null;
  const [visitingRaw, setVisiting] = useState<string | null | "OWN">("OWN");
  const [boardOpen, setBoardOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const muted = useStore((s) => s.loungeMuted);
  const companyLabel = useStore((s) => s.companyLabel);
  const room = visitingRaw === "OWN" ? myTeam : visitingRaw;
  const isOwnRoom = room === myTeam;
  const profile = team?.profile;
  const company = profile
    ? profile.company_code
      ? companyName(profile.company_code, companyLabel)
      : t.whereNoCompany
    : null;
  const roomNames = [
    ...new Set((team?.rows ?? []).map((r) => r.team)),
  ].sort((a, b) => (a === myTeam ? -1 : b === myTeam ? 1 : (a ?? "").localeCompare(b ?? "")));

  // 自己的造型:伺服器是真相,store 是本機快取(進門第一幀就是你挑的樣子)。
  // draft 非 null = 換裝面板開著,房間裡的你即時換上正在挑的那套
  const myId = session?.user.id ?? "me";
  const myAvatar = useStore((s) => s.myAvatar);
  const setMyAvatar = useStore((s) => s.setMyAvatar);
  const savedCode = myAvatar?.uid === myId ? myAvatar.code : null;
  const [draft, setDraft] = useState<Avatar | null>(null);
  const myLook = draft ? lookOf(draft) : lookFor(myId, savedCode);
  // 伺服器的值回來就蓋掉快取 —— 在別台裝置換過裝,這台也會跟上。
  // undefined = 還沒載到 profile,不動快取
  const serverCode = team?.profile ? (team.profile.avatar ?? null) : undefined;
  useEffect(() => {
    if (serverCode !== undefined) setMyAvatar({ uid: myId, code: serverCode });
  }, [serverCode, myId, setMyAvatar]);

  const saveDraft = async (): Promise<string | null> => {
    if (!draft) return null;
    // 挑回預設臉就存 null:「沒自訂」比「自訂成跟預設一樣」誠實,之後預設規則變了也跟著走
    const picked = encodeAvatar(draft);
    const code = picked === encodeAvatar(defaultAvatar(myId)) ? null : picked;
    const err = await saveAvatar(code);
    if (err) return err;
    setMyAvatar({ uid: myId, code });
    setDraft(null);
    team?.refresh();
    return null;
  };

  // 走位(鍵盤、點地板、碰撞、鏡頭)跟休息室共用一份。從休息室走門回來的站門口
  const { stageRef, worldRef, meRef, feet, pos, pose, tapMove, teleport } = useWalker(
    OFFICE,
    atDoor ? SPAWN_DOOR : activeSince ? SPAWN_BREAK : SPAWN_DESK,
    atDoor || activeSince ? STAND : SIT,
    (f, p, stopped) => live.move(f.x, f.y, facingOf(p), stopped),
  );
  // 即時房間 = 自己隊的辦公室:看得到隊友走動、能聊天。串門子時不連 ——
  // 你是幽靈,別隊聽不到你,你也聽不到別隊
  const live = useRoom(isOwnRoom ? "office" : null, feet);
  const liveMembers = Object.values(live.state.members);
  const names = displayNames(liveMembers);
  const { say, emote } = bubbles(live, now);
  const myName = names[myId] ?? team?.profile?.handle;
  // 人在這間的照實走動;其他在線的同事照狀態站位(座位/茶水間),跟以前一樣
  const teammates = placeTeammates(
    (team?.rows ?? []).filter((r) => r.team === room && !live.state.members[r.userId]),
    session?.user.id,
  );
  const pickedLive = picked ? live.state.members[picked] : undefined;
  const pickedRow = picked ? team?.rows.find((r) => r.userId === picked) : undefined;

  // 走進下牆的門 = 去休息室(串門子中也一樣,休息室是全公司的)
  useEffect(() => {
    if (OFFICE.tileAt(pos) === DOOR) onLounge();
  }, [pos, onLounge]);

  // 魚點:今天的時刻表由伺服器種子決定,只在自己房間出現
  const { spots, refresh: refreshSpots } = useSpots();
  const activeSpot =
    spots.find((s) => !s.caught && now >= s.start_ms && now < s.end_ms) ?? null;
  const nextSpot = spots.find((s) => now < s.start_ms) ?? null;
  const todayFishes = spots.filter((s) => s.caught).length;
  const fishPos = activeSpot ? fishTile(activeSpot) : null;
  const onFish =
    isOwnRoom && fishPos !== null && pos.x === fishPos.x && pos.y === fishPos.y;

  // 走位的語意:茶水間或魚點 = 開始摸魚,自己座位 = 結束,走廊中性。
  // 辦公室是 Phase 2 那顆按鈕的皮,動的是同一個 store。
  // 只在自己房間生效 —— 串門子是旁觀,別隊的茶水間不是你的茶水間。
  const zone = zoneAt(pos);
  useEffect(() => {
    if (!isOwnRoom) return;
    if ((zone === "break" || onFish) && activeSince === null) startSlacking();
    if (zone === "desk" && activeSince !== null) stopSlacking();
  }, [zone, onFish, activeSince, isOwnRoom, startSlacking, stopSlacking]);

  // 外快區:2×2 綠框,站著加倍領錢。位置純本機決定(錢不上傳,沒有作弊
  // 對象,不像魚需要伺服器種子),免登入。串門子不生效 —— 你是幽靈。
  const bonusAnchor = bonusZoneAt(now);
  const onBonus = isOwnRoom && inBonusZone(pos, bonusAnchor);

  // 站進去記時間戳,離開(含換位、離開辦公室)才把這段折進 store。
  // 顯示值照舊即時推導 —— 存的是毫秒不是錢,不用 interval 累加。
  const bonusEnteredAt = useRef<number | null>(null);
  useEffect(() => {
    if (!onBonus) return;
    bonusEnteredAt.current = Date.now();
    return () => {
      if (bonusEnteredAt.current !== null) {
        addZoneMs(Date.now() - bonusEnteredAt.current, dayKey(Date.now()));
        bonusEnteredAt.current = null;
      }
    };
  }, [onBonus, addZoneMs]);

  const zoneLiveMs =
    (zoneMs.day === dayKey(now) ? zoneMs.ms : 0) +
    (onBonus && bonusEnteredAt.current !== null ? Math.max(0, now - bonusEnteredAt.current) : 0);

  // 每分鐘把今日外快點數回報上去,離開辦公室時再補一次。
  // 送的是「今天的總量」而不是增量 —— 重送、漏送、順序亂掉都不會算錯,
  // 失敗也不用補償邏輯:下一次 tick 送的還是同一個總量。伺服器會夾在
  // 「今天已流逝時間 × 10 點/分」以內,所以這裡送的是申請,不是結論。
  const zonePointsRef = useRef(0);
  zonePointsRef.current = points(zoneLiveMs, 0);
  useEffect(() => {
    if (!session) return;
    const push = () => void syncZonePoints(zonePointsRef.current);
    push();
    const id = setInterval(push, 60_000);
    return () => {
      clearInterval(id);
      push();
    };
  }, [session]);

  // 站上魚點就抓。合法性由 DB trigger 用伺服器時鐘判,這裡只是提出申請。
  // inflight guard 擋連發;成功後 refresh 讓 caught 從伺服器回來,魚消失。
  const catching = useRef(false);
  useEffect(() => {
    if (!onFish || !activeSpot || catching.current) return;
    catching.current = true;
    catchFish(activeSpot.spot_index).then((ok) => {
      catching.current = false;
      if (ok) refreshSpots();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFish, activeSpot?.spot_index]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-[36px] text-crt-white">{t.office}</h1>
        <div className="flex gap-2">
          {/* 再按一次 = 不存直接關,跟面板上的「關閉」一樣 */}
          <button
            onClick={() =>
              setDraft(draft ? null : (decodeAvatar(savedCode) ?? defaultAvatar(myId)))
            }
            className="px-btn"
            aria-pressed={draft !== null}
          >
            {t.wardrobe}
          </button>
          {/* 公司休息室:同公司所有隊伍共用、即時同屋。隊伍房間是你們隊的,這間是大家的 */}
          <button onClick={onLounge} className="px-btn">
            {t.lounge}
          </button>
          <button
            onClick={onBack}
            className="px-btn"
          >
            {t.back}
          </button>
        </div>
      </header>

      {company && (
        <Where company={company} room={`${room ?? t.lobby}${isOwnRoom ? "" : t.whereVisiting}`} />
      )}

      <div className="flex flex-wrap items-center gap-2 px-small">
        {activeSince === null ? (
          <span className="px-bevel-in bg-crt-deep px-3 py-1 text-crt-green">
            {t.stateWorking}
          </span>
        ) : (
          <span className="px-bevel-in bg-crt-deep px-3 py-1 text-crt-gold">
            {t.officeSlacking} · <span className="tabular-nums">{dur(now - activeSince)}</span>
          </span>
        )}
        <span className="tabular-nums text-crt-dim" title={t.zoneHint}>
          {/* 跟主畫面同一個數:摸魚幣 = 外快區站立(含進行中)+ 漁獲獎勵 */}
          {t.todayStolen} {pts.format(points(zoneLiveMs, todayFishes))} {t.pointsUnit}
        </span>
        {/* 魚況:沒登入不顯示(魚點需要伺服器種子);沒跑 v3 遷移 = 沒有魚 */}
        {session && spots.length > 0 && (
          <span className="tabular-nums text-crt-dim">
            {activeSpot ? (
              <span className="text-crt-gold">
                {t.fishHere} {mmss(activeSpot.end_ms - now)}
              </span>
            ) : nextSpot ? (
              `${t.fishNext} ${hhmm(nextSpot.start_ms)}`
            ) : (
              t.fishNone
            )}
            {"　"}
            {t.fishToday} 🐟×{todayFishes}
          </span>
        )}
      </div>

      {/* 一隊一房,點分頁串門子。只有一間(或沒登入)就不顯示 */}
      {roomNames.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 px-small">
          <span className="mr-1 text-crt-dim">{t.visitTabs}</span>
          {roomNames.map((name) => (
            <button
              key={name ?? "__lobby"}
              onClick={() => {
                if (name === room) return;
                setVisiting(name === myTeam ? "OWN" : name);
                setPicked(null);
                // 換房間重生:回自己房照狀態站位,去別隊房從門口進去。在點的當下做,
                // 不用 effect —— 隊伍資料載入完成(room 從 null 變隊名)不該把人瞬移
                const spawn = name === myTeam ? (activeSince ? SPAWN_BREAK : SPAWN_DESK) : SPAWN_DOOR;
                teleport(spawn, spawn === SPAWN_DESK ? SIT : STAND);
              }}
              className={`px-2.5 py-1 ${
                room === name
                  ? "px-bevel-in bg-crt-deep text-crt-white"
                  : "text-crt-dim hover:text-crt-white"
              }`}
            >
              {name ?? t.lobby}
              {name === myTeam && (
                <span className="ml-0.5 text-crt-dim">{t.yourRoomSuffix}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 舞台:寬度跟著容器,房間比它寬時(手機)鏡頭跟著人走,不再整片橫向捲動 */}
      <div
        ref={stageRef}
        className="px-bevel relative overflow-hidden bg-crt-deep"
        style={{ height: ROWS * TILE + 4 }}
      >
        <div
          ref={worldRef}
          className="absolute top-0 left-0 cursor-pointer select-none"
          style={{ width: COLS * TILE, height: ROWS * TILE, touchAction: "manipulation" }}
          onClick={tapMove}
        >
          <Scene map={OFFICE} def={OFFICE_SCENE} />
          {/* 外快區:綠框白底,站進去補血十字往上飄 + 加倍領錢。
              畫在地上(z=1),家具與人都在它上面。pointer-events-none 讓點擊穿過去 */}
          {isOwnRoom && (
            <div
              data-bonus
              className="pointer-events-none absolute top-0 left-0 z-[1]"
              style={{
                transform: `translate(${bonusAnchor.x * TILE}px, ${bonusAnchor.y * TILE}px)`,
              }}
            >
              <div className="px-zone" style={{ width: TILE * 2, height: TILE * 2 }} />
              {onBonus && (
                <>
                  <span className="px-heal" style={{ left: 8 }} />
                  <span className="px-heal" style={{ left: 38, animationDelay: ".5s" }} />
                  <span className="px-heal" style={{ left: 23, animationDelay: "1s" }} />
                </>
              )}
            </div>
          )}
          {/* 魚點只長在自己房間。站上去 = 摸魚 + 抓魚 */}
          {isOwnRoom && activeSpot && fishPos && (
            <div
              data-fish
              className="pointer-events-none absolute top-0 left-0 flex size-8 flex-col items-center justify-center"
              style={{
                transform: `translate(${fishPos.x * TILE}px, ${fishPos.y * TILE}px)`,
                zIndex: depth(fishPos.y + 0.5) - 1,
              }}
            >
              <span className="px-bob text-[24px]">🐟</span>
              <span className="bg-crt-deep/90 px-1 px-small leading-tight text-crt-gold tabular-nums">
                {mmss(activeSpot.end_ms - now)}
              </span>
            </div>
          )}
          {/* 留言板入口在牆上,不在主畫面 —— 它屬於這間辦公室 */}
          <BoardSign onOpen={() => setBoardOpen(true)} />
          <DoorSign at={OFFICE_DOOR} label={t.lounge} />
          {teammates.map((m) => {
            const [ax, ay] = actorAt(m.pos.x + 0.5, m.pos.y + 0.5);
            const slacking = m.state === "slacking";
            return (
              <div
                key={m.userId}
                data-teammate={m.handle}
                // 狀態變了(座位↔茶水間)靠 transition 自己「走」過去
                className="absolute top-0 left-0 cursor-pointer transition-transform duration-700 ease-in-out"
                style={{
                  transform: `translate(${ax}px, ${ay}px)`,
                  zIndex: depth(m.pos.y + 0.5),
                }}
                title={`${m.handle} · ${slacking ? t.officeSlacking : t.stateWorking}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPicked(m.userId);
                }}
              >
                <NameTag name={m.handle} />
                {/* 上班中背對鏡頭坐在螢幕前;摸魚中面向你、輕輕晃 ——
                    一眼就能從人群裡看出誰在混 */}
                <div className={slacking ? "px-bob" : undefined}>
                  <Actor
                    look={lookFor(m.userId, m.avatar)}
                    pose={slacking ? STAND : SIT}
                    blink={(m.pos.x * 7 + m.pos.y * 3) % 5}
                  />
                </div>
              </div>
            );
          })}
          {liveMembers
            .filter((m) => m.uid !== myId)
            .map((m) => (
              <Remote
                key={m.uid}
                map={OFFICE}
                member={m}
                look={lookFor(m.uid, m.avatar)}
                name={names[m.uid] ?? m.handle}
                say={muted.includes(m.uid) ? null : (say[m.uid] ?? null)}
                emoji={muted.includes(m.uid) ? null : emote(m.uid)}
                onPick={setPicked}
              />
            ))}
          <div ref={meRef} data-player className="pointer-events-none absolute top-0 left-0">
            <Bubble text={say[myId] ?? null} emoji={emote(myId)} />
            {/* 自己的名牌是金色 —— 人一多,一眼找到自己 */}
            {myName && <NameTag name={myName} me />}
            {/* 串門子時是半透明的幽靈:對方看不到你,你也踩不動任何機關 */}
            <Actor look={myLook} pose={pose} ghost={!isOwnRoom} blink={2.3} />
          </div>
        </div>
        {picked && (pickedLive || pickedRow) && (
          <PersonCard
            key={picked}
            uid={picked}
            name={names[picked] ?? pickedLive?.handle ?? pickedRow?.handle ?? ""}
            look={lookFor(picked, pickedLive ? pickedLive.avatar : pickedRow?.avatar)}
            row={pickedRow}
            here={pickedLive !== undefined}
            room={live}
            onClose={() => setPicked(null)}
          />
        )}
        <ChatBar room={live} now={now} />
      </div>

      {draft && (
        <Wardrobe
          draft={draft}
          onDraft={(change) => setDraft((d) => d && change(d))}
          defaults={defaultAvatar(myId)}
          onSave={saveDraft}
          onClose={() => setDraft(null)}
        />
      )}

      {/* 留言板開在辦公室裡。串門子時看得到別隊的板但不能發言 —— 你是幽靈 */}
      {boardOpen && (
        <Board team={room} canPost={isOwnRoom} onClose={() => setBoardOpen(false)} />
      )}

      {/* 辦公室的即時聊天:只有自己隊、人在這間的聽得到。串門子時面板只說為什麼不能聊 */}
      <ChatPanel
        room={live}
        names={names}
        myId={myId}
        now={now}
        privacy={t.chatPrivacyOffice}
        // 座位上有照狀態站位的隊友,就不是「只有你」—— 他們只是沒開辦公室
        alone={teammates.length === 0 ? t.aloneOffice : null}
      />

      {/* 手機沒有鍵盤,叫人按方向鍵是空話 —— 兩份文案用斷點切,不用 JS 測裝置 */}
      <p className="text-crt-dim">
        {isOwnRoom ? (
          <>
            <span className="sm:hidden">{t.officeHintMobile}</span>
            <span className="hidden sm:inline">{t.officeHint}</span>
          </>
        ) : (
          t.visitHint
        )}
      </p>
    </div>
  );
}
