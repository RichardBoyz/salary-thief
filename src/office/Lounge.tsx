import { useEffect, useState } from "react";
import { companyName } from "../companies";
import { displayNames } from "../lounge";
import { useStore } from "../store";
import { t } from "../strings";
import { useRoom, useSession, useTeam } from "../sync";
import { useNow } from "../useNow";
import Actor, { NameTag, STAND } from "./Actor";
import { DOOR, LOUNGE, LOUNGE_DOOR, LOUNGE_SPAWN, TILE } from "./map";
import { LOUNGE_SCENE } from "./props";
import { Bubble, bubbles, ChatBar, ChatPanel, DoorSign, facingOf, PersonCard, Remote, Where } from "./Room";
import Scene from "./Scene";
import { lookFor } from "./sprite";
import { useWalker } from "./useWalker";

/**
 * 公司休息室。同公司所有隊伍共用一間,即時看到彼此走動、聊天。
 * 待在這裡算摸魚時數,但不生摸魚幣(不然要多一套防作弊)。下牆的門回辦公室。
 */
export default function Lounge({ onBack }: { onBack: () => void }) {
  const session = useSession();
  const myId = session?.user.id ?? "me";
  const now = useNow();
  const activeSince = useStore((s) => s.activeSince);
  const startSlacking = useStore((s) => s.startSlacking);
  const myAvatar = useStore((s) => s.myAvatar);
  const muted = useStore((s) => s.loungeMuted);
  const companyLabel = useStore((s) => s.companyLabel);
  const myLook = lookFor(myId, myAvatar?.uid === myId ? myAvatar.code : null);
  // 點人物看他是誰:隊伍與本週戰績。排行榜同一份資料(同公司本來就看得到)
  const team = useTeam(45_000);
  const [picked, setPicked] = useState<string | null>(null);

  // 走進休息室 = 摸魚(跟走進茶水間一樣);離開這裡不會自動結束,回座位才算
  useEffect(() => {
    if (activeSince === null) startSlacking();
  }, [activeSince, startSlacking]);

  const { stageRef, worldRef, meRef, feet, pos, pose, tapMove } = useWalker(
    LOUNGE,
    LOUNGE_SPAWN,
    STAND,
    (f, p, stopped) => live.move(f.x, f.y, facingOf(p), stopped),
  );
  const live = useRoom("lounge", feet);

  // 走進下牆的門 = 回辦公室
  useEffect(() => {
    if (LOUNGE.tileAt(pos) === DOOR) onBack();
  }, [pos, onBack]);

  const members = Object.values(live.state.members);
  const names = displayNames(members);
  const others = members.filter((m) => m.uid !== myId);
  const { say, emote } = bubbles(live, now);
  const myName = names[myId] ?? team?.profile?.handle;
  const companyCode = team?.profile?.company_code;
  const company = team?.profile
    ? companyCode
      ? companyName(companyCode, companyLabel)
      : t.whereNoCompany
    : null;
  const pickedMember = picked ? live.state.members[picked] : undefined;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-[36px] text-crt-white">{t.lounge}</h1>
        <button onClick={onBack} className="px-btn">
          {t.loungeBack}
        </button>
      </header>

      {company && <Where company={company} room={t.lounge} />}

      <div className="flex flex-wrap items-center gap-2 px-small">
        <span className="px-bevel-in bg-crt-deep px-3 py-1 text-crt-gold">{t.officeSlacking}</span>
      </div>

      <div
        ref={stageRef}
        className="px-bevel relative overflow-hidden bg-crt-deep"
        style={{ height: LOUNGE.rows * TILE + 4 }}
      >
        <div
          ref={worldRef}
          className="absolute top-0 left-0 cursor-pointer select-none"
          style={{ width: LOUNGE.cols * TILE, height: LOUNGE.rows * TILE, touchAction: "manipulation" }}
          onClick={tapMove}
        >
          <Scene map={LOUNGE} def={LOUNGE_SCENE} />
          <DoorSign at={LOUNGE_DOOR} label={t.office} />
          {others.map((m) => (
            <Remote
              key={m.uid}
              map={LOUNGE}
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
            {myName && <NameTag name={myName} me />}
            <Actor look={myLook} pose={pose} blink={2.3} />
          </div>
        </div>
        {pickedMember && (
          <PersonCard
            key={pickedMember.uid}
            uid={pickedMember.uid}
            name={names[pickedMember.uid] ?? pickedMember.handle}
            look={lookFor(pickedMember.uid, pickedMember.avatar)}
            row={team?.rows.find((r) => r.userId === pickedMember.uid)}
            here
            room={live}
            onClose={() => setPicked(null)}
          />
        )}
        <ChatBar room={live} now={now} />
      </div>

      <ChatPanel
        room={live}
        names={names}
        myId={myId}
        now={now}
        privacy={t.chatPrivacy}
        alone={t.aloneLounge}
      />

      <p className="text-crt-dim">
        <span className="sm:hidden">{t.loungeHintMobile}</span>
        <span className="hidden sm:inline">{t.loungeHint}</span>
      </p>
    </div>
  );
}
