import { useState } from "react";
import { dur } from "../fmt";
import { ratePerSecond } from "../money";
import { useStore } from "../store";
import { t } from "../strings";
import {
  react,
  saveProfile,
  sendMagicLink,
  signInWithGoogle,
  signOut,
  useSession,
  useTeam,
} from "../sync";
import { EMOJIS, teamAggregates, type MemberState } from "../team";

const input = "px-input";
const btn = "px-btn px-4 py-2 text-crt-gold";
const btnGhost = "px-btn";

const stateDot: Record<MemberState, string> = {
  slacking: "bg-crt-gold animate-pulse",
  working: "bg-crt-green",
  offline: "bg-crt-dim",
};
const stateLabel: Record<MemberState, string> = {
  slacking: t.officeSlacking,
  working: t.stateWorking,
  offline: t.stateOffline,
};

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
        <button
          onClick={() => signInWithGoogle()}
          className="px-btn w-full py-2.5 text-crt-gold"
        >
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

/** 取代號 + 開/加入公司。公司沒有名字,只有匿名邀請碼 —— 「不存公司」是隱私硬約束 */
function Setup({ onDone }: { onDone: () => void }) {
  const [handle, setHandle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const ok = handle.trim().length >= 1 && handle.trim().length <= 20;
  const submit = (companyCode: string) =>
    saveProfile(handle.trim(), companyCode, null).then(onDone);
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <button disabled={!ok} onClick={() => submit(crypto.randomUUID())} className={btn}>
          {t.setupCreate}
        </button>
        <div className="flex flex-1 gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={t.setupJoinPlaceholder}
            className={input}
          />
          <button
            disabled={!ok || joinCode.trim().length < 8}
            onClick={() => submit(joinCode.trim())}
            className={btn}
          >
            {t.setupJoin}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Team({ onBack }: { onBack: () => void }) {
  const session = useSession();
  const cfg = useStore((s) => s.config);
  const team = useTeam(30_000);
  const [copied, setCopied] = useState(false);
  const [changing, setChanging] = useState(false);
  const [teamInput, setTeamInput] = useState("");
  const [boardMine, setBoardMine] = useState(false);

  const me = session?.user.id;
  const profile = team?.profile ?? null;
  const myTeam = profile?.team ?? null;
  const handleOf = new Map((team?.members ?? []).map((m) => [m.user_id, m.handle]));
  const eventOwner = new Map((team?.events ?? []).map((e) => [e.id, e.user_id]));
  const received = (team?.reactions ?? []).filter(
    (r) => r.from_user !== me && eventOwner.get(r.event_id) === me,
  );
  // 隊伍清單 = 同公司 distinct team。不開 teams 表,標籤即隊伍
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-crt-dim">{t.companyCode}</span>
            <code className="px-bevel-in bg-crt-deep px-2 py-1 text-xs text-crt-gold">
              {profile.company_code}
            </code>
            <button
              className={btnGhost}
              onClick={() => {
                navigator.clipboard.writeText(profile.company_code ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t.copied : t.copyCode}
            </button>
            <button className={btnGhost} onClick={() => setChanging(true)}>
              {t.changeCompany}
            </button>
            <button className={btnGhost} onClick={team!.refresh}>
              {t.refresh}
            </button>
          </div>

          {/* 我的隊伍:標籤即隊伍,datalist 給既有隊名,打新名字就是開新隊 */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-crt-dim">{t.myTeam}</span>
            {myTeam ? (
              <span className="px-bevel-in bg-crt-deep px-2 py-1 text-xs text-crt-white">
                {myTeam}
              </span>
            ) : (
              <span className="text-crt-dim">{t.teamNone}</span>
            )}
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = teamInput.trim();
                if (!name || !profile) return;
                saveProfile(profile.handle, profile.company_code, name).then(() => {
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
            <span className="tabular-nums text-crt-gold">
              {dur(team!.totalMs)}
            </span>
            <span className="ml-2 text-crt-dim">
              {t.teamTotalPrivate}$
              {Math.round((team!.totalMs / 1000) * ratePerSecond(cfg, Date.now())).toLocaleString()}
              {t.onlyYouSee}
            </span>
          </div>

          {aggregates.length > 1 && (
            <div>
              <div className="mb-2 text-crt-dim">{t.teamVs}</div>
              <ul className="flex flex-col gap-1.5">
                {aggregates.map((a, i) => (
                  <li
                    key={a.team ?? "__lobby"}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${
                      a.team === myTeam
                        ? "px-row-me"
                        : "px-row"
                    }`}
                  >
                    <span className="w-5 text-right tabular-nums text-crt-dim">{i + 1}</span>
                    <span className="flex-1 truncate text-crt-white">{teamTag(a.team)}</span>
                    <span className="text-crt-dim">
                      {a.members} {t.membersUnit}
                    </span>
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
                    r.userId === me
                      ? "px-row-me"
                      : "px-row"
                  }`}
                >
                  <span className="w-5 text-right text-sm tabular-nums text-crt-dim">
                    {i + 1}
                  </span>
                  <span
                    className={`size-2 ${stateDot[r.state]}`}
                    title={stateLabel[r.state]}
                  />
                  <span className="flex-1 truncate text-sm text-crt-white">
                    {r.handle}
                    <span className="ml-2 bg-crt-deep px-1.5 py-0.5 text-[10px] text-crt-dim">
                      {teamTag(r.team)}
                    </span>
                  </span>
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
            {(team?.rows.length ?? 0) <= 1 && (
              <p className="mt-3 text-crt-dim">{t.noTeammates}</p>
            )}
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
