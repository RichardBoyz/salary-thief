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
import { EMOJIS, type MemberState } from "../team";

const input =
  "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500";
const btn =
  "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40";
const btnGhost =
  "rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200";

const stateDot: Record<MemberState, string> = {
  slacking: "bg-amber-400 animate-pulse",
  working: "bg-emerald-400",
  offline: "bg-slate-600",
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
        <h2 className="font-semibold text-slate-100">{t.loginTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">{t.loginDesc}</p>
      </div>
      <div>
        <button
          onClick={() => signInWithGoogle()}
          className="w-full rounded-lg bg-slate-100 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-white"
        >
          {t.loginGoogle}
        </button>
        <p className="mt-1.5 text-xs text-slate-600">{t.loginGoogleHint}</p>
      </div>

      {sent ? (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-400">
          {t.loginSent}
        </p>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">{t.loginOr}</summary>
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
      <p className="text-xs text-slate-600">{t.loginPrivacy}</p>
    </div>
  );
}

function Setup({ onDone }: { onDone: () => void }) {
  const [handle, setHandle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const ok = handle.trim().length >= 1 && handle.trim().length <= 20;
  const submit = (teamCode: string) =>
    saveProfile(handle.trim(), teamCode).then(onDone);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-slate-100">{t.setupTitle}</h2>
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

  const me = session?.user.id;
  const handleOf = new Map((team?.members ?? []).map((m) => [m.user_id, m.handle]));
  const eventOwner = new Map((team?.events ?? []).map((e) => [e.id, e.user_id]));
  // 你收到的起鬨:別人的 reaction、目標是你的事件
  const received = (team?.reactions ?? []).filter(
    (r) => r.from_user !== me && eventOwner.get(r.event_id) === me,
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{t.team}</h1>
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

      {session && team && (!team.profile || changing) && (
        <Setup
          onDone={() => {
            setChanging(false);
            team.refresh();
          }}
        />
      )}

      {session && team?.profile && !changing && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">{t.teamCode}</span>
            <code className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">
              {team.profile.team_code}
            </code>
            <button
              className={btnGhost}
              onClick={() => {
                navigator.clipboard.writeText(team.profile!.team_code ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t.copied : t.copyCode}
            </button>
            <button className={btnGhost} onClick={() => setChanging(true)}>
              {t.changeTeam}
            </button>
            <button className={btnGhost} onClick={team.refresh}>
              {t.refresh}
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
            <span className="text-slate-500">{t.teamTotal} </span>
            <span className="font-semibold tabular-nums text-slate-100">
              {dur(team.totalMs)}
            </span>
            <span className="ml-2 text-xs text-slate-600">
              {t.teamTotalPrivate}$
              {Math.round((team.totalMs / 1000) * ratePerSecond(cfg, Date.now())).toLocaleString()}
              {t.onlyYouSee}
            </span>
          </div>

          <div>
            <div className="mb-2 text-xs text-slate-500">{t.weekBoard}</div>
            <ul className="flex flex-col gap-1.5">
              {team.rows.map((r, i) => (
                <li
                  key={r.userId}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    r.userId === me
                      ? "border-emerald-900 bg-emerald-950/30"
                      : "border-slate-800 bg-slate-900/40"
                  }`}
                >
                  <span className="w-5 text-right text-sm tabular-nums text-slate-600">
                    {i + 1}
                  </span>
                  <span
                    className={`size-2 rounded-full ${stateDot[r.state]}`}
                    title={stateLabel[r.state]}
                  />
                  <span className="flex-1 truncate text-sm text-slate-200">{r.handle}</span>
                  <span className="text-sm tabular-nums text-slate-400">{dur(r.weekMs)}</span>
                  {r.userId !== me && r.latestEventId && (
                    <span className="flex gap-0.5">
                      {EMOJIS.slice(0, 3).map((e) => (
                        <button
                          key={e}
                          title={e}
                          className="rounded px-1 text-sm opacity-50 transition hover:scale-125 hover:opacity-100"
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
            {team.rows.length <= 1 && (
              <p className="mt-3 text-sm text-slate-500">{t.noTeammates}</p>
            )}
          </div>

          {received.length > 0 && (
            <div className="text-sm text-slate-400">
              <span className="text-xs text-slate-500">{t.received}:</span>{" "}
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
