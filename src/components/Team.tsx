import { useEffect, useState } from "react";
import {
  buildInviteLink,
  companyName,
  type Invite,
  isDirectoryCompany,
  normalizeCustom,
  type RegistryCompany,
  searchCompanies,
  searchRegistry,
  slugToUuid,
} from "../companies";
import { dur } from "../fmt";
import { ratePerSecond } from "../money";
import { useStore } from "../store";
import { t } from "../strings";
import {
  react,
  saveProfile,
  sendMagicLink,
  setEmployment,
  signInWithGoogle,
  signOut,
  useCompanyRankings,
  useSession,
  useTeam,
} from "../sync";
import { EMOJIS, teamAggregates, type Employment, type MemberState } from "../team";

const input = "px-input";
const btn = "px-btn px-4 py-2 text-crt-gold";
const btnGhost = "px-btn";

const stateDot: Record<MemberState, string> = {
  slacking: "bg-crt-gold animate-pulse",
  working: "bg-crt-green",
  offline: "bg-crt-dim",
};
// 函式不做成常數:t 會原地換語言,module scope 抄字串會凍住舊語言
const stateLabelOf = (): Record<MemberState, string> => ({
  slacking: t.officeSlacking,
  working: t.stateWorking,
  offline: t.stateOffline,
});

/** 「<暱稱> 邀請你加入 [房間]」—— 三個入口(未登入/取代號/已有代號)共用,寫清楚是誰邀的 */
function InviteHeadline({ invite }: { invite: Invite }) {
  return (
    <span className="text-crt-dim">
      <span className="text-crt-white">{invite.handle ?? t.inviteSomeone}</span>
      {t.invitePending}
      <span className="ml-1 inline-block px-bevel-in bg-crt-deep px-2 py-1 text-crt-gold">
        {invite.name ?? companyName(invite.code)}
      </span>
    </span>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-crt-white">{t.loginTitle}</h2>
        <p className="mt-1 text-crt-dim">{t.loginDesc}</p>
      </div>
      <div>
        <button onClick={() => signInWithGoogle()} className="px-btn w-full py-2.5 text-crt-gold">
          {t.loginGoogle}
        </button>
        <p className="mt-1.5 text-crt-dim">{t.loginGoogleHint}</p>
      </div>
      {sent ? (
        <p className="px-bevel-in bg-crt-deep px-3 py-2 text-crt-green">{t.loginSent}</p>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer text-crt-dim">{t.loginOr}</summary>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.includes("@")) return;
              sendMagicLink(email).then(({ error }) => !error && setSent(true));
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.loginEmailPlaceholder}
              className={input}
            />
            <button type="submit" className={btn}>
              {t.loginSend}
            </button>
          </form>
        </details>
      )}
      <p className="text-crt-dim">{t.loginPrivacy}</p>
    </div>
  );
}

/**
 * 取代號 + 選公司。公司從真實目錄選(或自訂),房間鍵由公司名決定性導出
 * —— 兩個同事各自選台積電就同房,不用互傳碼。DB 只存 uuid、不存公司名;
 * 自訂公司的顯示名只記在本機(setCompanyLabel)。
 */
function Setup({ onDone }: { onDone: () => void }) {
  const [handle, setHandle] = useState("");
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const setCompanyLabel = useStore((s) => s.setCompanyLabel);
  const invite = useStore((s) => s.pendingInvite);
  const setPendingInvite = useStore((s) => s.setPendingInvite);
  const [registry, setRegistry] = useState<RegistryCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const ok = handle.trim().length >= 1 && handle.trim().length <= 20;
  const results = searchCompanies(query).slice(0, 8);

  // 目錄之外再搜政府登記(debounce + abort)。目錄是同步的、這裡是非同步的,
  // 兩段各自渲染,gcis 掛了目錄照常能用。
  useEffect(() => {
    const q = query.trim().replace(/\s+/g, "");
    if (q.length < 2) {
      setRegistry([]);
      setSearching(false);
      return;
    }
    const ctl = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchRegistry(q, ctl.signal)
        .then((rows) => {
          setRegistry(rows);
          setSearching(false);
        })
        .catch(() => {}); // abort 或 gcis 掛掉:留著上一批結果,不炸畫面
    }, 350);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query]);

  const join = (code: string, label: string) => {
    setCompanyLabel(label);
    saveProfile(handle.trim(), code, null).then(onDone);
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-crt-white">{t.setupTitle}</h2>
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        maxLength={20}
        placeholder={t.setupHandlePlaceholder}
        className={input}
      />

      {/* 點了邀請連結進來的:取完代號一鍵進同事的房,不用再搜公司 */}
      {invite && (
        <div className="px-panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <InviteHeadline invite={invite} />
          <button
            className={btn}
            disabled={!ok}
            onClick={() => {
              setPendingInvite(null);
              join(invite.code, invite.name ?? companyName(invite.code));
            }}
          >
            {t.companyJoin}
          </button>
          <button className={btnGhost} onClick={() => setPendingInvite(null)}>
            {t.inviteIgnore}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-crt-dim">{t.companyPick}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.companySearch}
          className={input}
        />
        <ul className="flex flex-col gap-1">
          {results.map((c) => (
            <li key={c.slug}>
              <button
                disabled={!ok}
                onClick={() => join(slugToUuid(c.slug), c.name)}
                className="px-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-crt-white hover:bg-crt-bg disabled:opacity-40"
              >
                <span className="flex-1">{c.name}</span>
                {c.aka && <span className="text-[10px] text-crt-dim">{c.aka}</span>}
              </button>
            </li>
          ))}
        </ul>

        {searching && <p className="text-[10px] text-crt-dim">{t.companySearching}</p>}
        {registry.length > 0 && (
          <>
            <span className="mt-1 text-[10px] text-crt-dim">{t.companyRegistry}</span>
            <ul className="flex flex-col gap-1">
              {registry.map((r) => (
                <li key={r.taxId}>
                  <button
                    disabled={!ok}
                    onClick={() => join(slugToUuid(r.taxId), r.name)}
                    className="px-row flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-crt-white hover:bg-crt-bg disabled:opacity-40"
                  >
                    <span className="flex-1">{r.name}</span>
                    <span className="text-[10px] text-crt-dim">
                      {r.city} {r.taxId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const name = custom.trim();
          if (!ok || name.length < 2) return;
          join(slugToUuid(normalizeCustom(name)), name);
        }}
      >
        <span className="text-crt-dim">{t.companyCustomHint}</span>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={30}
            placeholder={t.companyCustomPlaceholder}
            className={input}
          />
          <button type="submit" className={btn} disabled={!ok || custom.trim().length < 2}>
            {t.companyJoin}
          </button>
        </div>
      </form>

      <p className="text-crt-dim">{t.companyPrivacy}</p>
    </div>
  );
}

/** 在職/離職切換 */
function EmploymentToggle({
  value,
  onChange,
}: {
  value: Employment;
  onChange: (e: Employment) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-crt-dim">{t.employment}</span>
      <div className="flex gap-1">
        {(["current", "former"] as const).map((e) => (
          <button
            key={e}
            onClick={() => onChange(e)}
            className={`px-2.5 py-1 text-xs ${
              value === e ? "px-bevel-in bg-crt-deep text-crt-white" : "text-crt-dim hover:text-crt-white"
            }`}
          >
            {e === "current" ? t.employmentCurrent : t.employmentFormer}
          </button>
        ))}
      </div>
      <span className="text-[10px] text-crt-dim">{t.employmentHint}</span>
    </div>
  );
}

/** 各公司本週摸魚:k-anon 聚合(server 只回 ≥5 人),名字靠 client 目錄反查 */
function CrossCompany({ myCode }: { myCode: string | null }) {
  const rankings = useCompanyRankings(60_000);
  const rows = [...rankings]
    .map((r) => ({ ...r, perCap: r.members > 0 ? r.total_ms / r.members : 0 }))
    .sort((a, b) => b.perCap - a.perCap);
  return (
    <div>
      <div className="mb-2 text-crt-dim">{t.crossCompany}</div>
      {rows.length === 0 ? (
        <p className="text-crt-dim">{t.crossCompanyEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li
              key={r.company_code}
              className={`flex items-center gap-3 px-3 py-2 text-sm ${
                r.company_code === myCode ? "px-row-me" : "px-row"
              }`}
            >
              <span className="w-5 text-right tabular-nums text-crt-dim">{i + 1}</span>
              <span className="flex-1 truncate text-crt-white">
                {/* 只有目錄公司具名;自訂公司即使湊滿 5 人也只顯示「其他公司」 */}
                {isDirectoryCompany(r.company_code) ? companyName(r.company_code) : t.crossOtherCompany}
              </span>
              <span className="text-crt-dim">{r.members} {t.membersUnit}</span>
              <span className="text-xs tabular-nums text-amber-400/80">
                {t.perCap} {dur(r.perCap)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] text-crt-dim">{t.crossCompanyHint}</p>
    </div>
  );
}

export default function Team({ onBack }: { onBack: () => void }) {
  const session = useSession();
  const cfg = useStore((s) => s.config);
  const companyLabel = useStore((s) => s.companyLabel);
  const setCompanyLabel = useStore((s) => s.setCompanyLabel);
  const pendingInvite = useStore((s) => s.pendingInvite);
  const setPendingInvite = useStore((s) => s.setPendingInvite);
  const team = useTeam(30_000);
  const [changing, setChanging] = useState(false);
  const [teamInput, setTeamInput] = useState("");
  const [boardMine, setBoardMine] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const me = session?.user.id;
  const profile = team?.profile ?? null;

  // 已經在邀請的那間了(自己點自己的連結、或重複點)→ 邀請默默收掉
  useEffect(() => {
    if (pendingInvite && profile?.company_code === pendingInvite.code) setPendingInvite(null);
  }, [pendingInvite, profile?.company_code, setPendingInvite]);

  // 有代號的人一鍵換到邀請的房;換公司 = 隊伍歸零,跟 Setup 換公司同規則
  const joinInvite = () => {
    if (!pendingInvite || !profile) return;
    setCompanyLabel(pendingInvite.name ?? companyName(pendingInvite.code));
    saveProfile(profile.handle, pendingInvite.code, null, profile.employment).then(() => {
      setPendingInvite(null);
      team!.refresh();
    });
  };

  const copyInvite = () => {
    if (!profile?.company_code) return;
    navigator.clipboard
      .writeText(
        buildInviteLink(
          location.origin,
          profile.company_code,
          companyName(profile.company_code, companyLabel),
          profile.handle,
        ),
      )
      .then(() => {
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
      });
  };
  const myTeam = profile?.team ?? null;
  const handleOf = new Map((team?.members ?? []).map((m) => [m.user_id, m.handle]));
  const eventOwner = new Map((team?.events ?? []).map((e) => [e.id, e.user_id]));
  const received = (team?.reactions ?? []).filter(
    (r) => r.from_user !== me && eventOwner.get(r.event_id) === me,
  );
  const teamNames = [
    ...new Set((team?.members ?? []).map((m) => m.team).filter((x): x is string => !!x)),
  ].sort();
  const aggregates = teamAggregates(team?.rows ?? []);
  const boardRows = (team?.rows ?? []).filter((r) => !boardMine || r.team === myTeam);
  const teamTag = (name: string | null) => name ?? t.lobby;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl text-crt-white">{t.team}</h1>
        <div className="flex items-center gap-2">
          {session && (
            <button onClick={() => signOut()} className={btnGhost}>
              {t.signOut}
            </button>
          )}
          <button onClick={onBack} className={btnGhost}>
            {t.back}
          </button>
        </div>
      </header>

      {!session && pendingInvite && (
        <div className="px-panel flex flex-col gap-1 px-3 py-2 text-sm">
          <InviteHeadline invite={pendingInvite} />
          <span className="text-crt-dim">{t.inviteAfterLogin}</span>
        </div>
      )}
      {!session && <Login />}

      {session && team && (!profile?.company_code || changing) && (
        <Setup
          onDone={() => {
            setChanging(false);
            team.refresh();
          }}
        />
      )}

      {session && profile?.company_code && !changing && (
        <>
          {/* 有代號的人點了別人的邀請連結:一鍵換房 */}
          {pendingInvite && (
            <div className="px-panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <InviteHeadline invite={pendingInvite} />
              <button className={btn} onClick={joinInvite}>
                {t.companyJoin}
              </button>
              <button className={btnGhost} onClick={() => setPendingInvite(null)}>
                {t.inviteIgnore}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-crt-dim">{t.companyMine}</span>
            <span className="px-bevel-in bg-crt-deep px-2 py-1 text-crt-gold">
              {companyName(profile.company_code, companyLabel)}
            </span>
            <button className={btn} onClick={copyInvite}>
              {inviteCopied ? t.copied : t.invite}
            </button>
            <button className={btnGhost} onClick={() => setChanging(true)}>
              {t.changeCompany}
            </button>
            <button className={btnGhost} onClick={team!.refresh}>
              {t.refresh}
            </button>
          </div>

          <EmploymentToggle
            value={profile.employment}
            onChange={(e) => setEmployment(e).then(() => team!.refresh())}
          />

          {/* 我的隊伍:標籤即隊伍,datalist 給既有隊名,打新名字就是開新隊 */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-crt-dim">{t.myTeam}</span>
            {myTeam ? (
              <span className="px-bevel-in bg-crt-deep px-2 py-1 text-xs text-crt-white">{myTeam}</span>
            ) : (
              <span className="text-crt-dim">{t.teamNone}</span>
            )}
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = teamInput.trim();
                if (!name || !profile) return;
                saveProfile(profile.handle, profile.company_code, name, profile.employment).then(() => {
                  setTeamInput("");
                  team!.refresh();
                });
              }}
            >
              <input
                list="team-names"
                value={teamInput}
                onChange={(e) => setTeamInput(e.target.value)}
                maxLength={20}
                placeholder={t.teamPickPlaceholder}
                className={`${input} min-w-40 flex-1`}
              />
              <datalist id="team-names">
                {teamNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <button type="submit" className={btn} disabled={!teamInput.trim()}>
                {t.teamSave}
              </button>
            </form>
          </div>

          <div className="px-panel px-4 py-3 text-sm">
            <span className="text-crt-dim">{t.teamTotal} </span>
            <span className="tabular-nums text-crt-gold">{dur(team!.totalMs)}</span>
            <span className="ml-2 text-crt-dim">
              {t.teamTotalPrivate}$
              {Math.round((team!.totalMs / 1000) * ratePerSecond(cfg, Date.now())).toLocaleString()}
              {t.onlyYouSee}
            </span>
          </div>

          <CrossCompany myCode={profile.company_code} />

          {aggregates.length > 1 && (
            <div>
              <div className="mb-2 text-crt-dim">{t.teamVs}</div>
              <ul className="flex flex-col gap-1.5">
                {aggregates.map((a, i) => (
                  <li
                    key={a.team ?? "__lobby"}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${
                      a.team === myTeam ? "px-row-me" : "px-row"
                    }`}
                  >
                    <span className="w-5 text-right tabular-nums text-crt-dim">{i + 1}</span>
                    <span className="flex-1 truncate text-crt-white">{teamTag(a.team)}</span>
                    <span className="text-crt-dim">{a.members} {t.membersUnit}</span>
                    <span className="tabular-nums text-crt-gold">{dur(a.totalMs)}</span>
                    <span className="text-xs tabular-nums text-amber-400/80">
                      {t.perCap} {dur(a.perCapMs)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-crt-dim">{t.weekBoard}</span>
              <div className="flex gap-1 text-xs">
                {([false, true] as const).map((mine) => (
                  <button
                    key={String(mine)}
                    onClick={() => setBoardMine(mine)}
                    className={`px-2 py-1 ${
                      boardMine === mine
                        ? "px-bevel-in bg-crt-deep text-crt-white"
                        : "text-crt-dim hover:text-crt-white"
                    }`}
                  >
                    {mine ? t.boardMine : t.boardAll}
                  </button>
                ))}
              </div>
            </div>
            <ul className="flex flex-col gap-1.5">
              {boardRows.map((r, i) => (
                <li
                  key={r.userId}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    r.userId === me ? "px-row-me" : "px-row"
                  } ${r.employment === "former" ? "opacity-55" : ""}`}
                >
                  <span className="w-5 text-right text-sm tabular-nums text-crt-dim">{i + 1}</span>
                  <span className={`size-2 ${stateDot[r.state]}`} title={stateLabelOf()[r.state]} />
                  <span className="flex-1 truncate text-sm text-crt-white">
                    {r.handle}
                    <span className="ml-2 bg-crt-deep px-1.5 py-0.5 text-[10px] text-crt-dim">
                      {teamTag(r.team)}
                    </span>
                    {r.employment === "former" && (
                      <span className="ml-1 bg-crt-deep px-1.5 py-0.5 text-[10px] text-crt-red">
                        {t.formerBadge}
                      </span>
                    )}
                  </span>
                  {r.fishes > 0 && (
                    <span className="text-xs tabular-nums text-crt-dim" title={t.fishToday}>
                      🐟×{r.fishes}
                    </span>
                  )}
                  <span className="text-sm tabular-nums text-crt-gold">{dur(r.weekMs)}</span>
                  {r.userId !== me && r.latestEventId && (
                    <span className="flex gap-0.5">
                      {EMOJIS.slice(0, 3).map((e) => (
                        <button
                          key={e}
                          title={e}
                          className="px-1 text-sm opacity-60 hover:opacity-100"
                          onClick={() => react(r.latestEventId!, e)}
                        >
                          {e}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {(team?.rows.length ?? 0) <= 1 && <p className="mt-3 text-crt-dim">{t.noTeammates}</p>}
          </div>

          {received.length > 0 && (
            <div className="text-crt-dim">
              <span className="text-crt-dim">{t.received}:</span>{" "}
              {received.slice(0, 8).map((r) => (
                <span key={r.id} className="mr-2">
                  {handleOf.get(r.from_user) ?? "?"} {r.emoji}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
