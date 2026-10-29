import { useEffect, useState } from "react";
import {
  buildInviteLink,
  companyName,
  type Invite,
  inviteParams,
  isDirectoryCompany,
  normalizeCustom,
  orgCode,
  type Place,
  type RegistryCompany,
  searchCompanies,
  searchOrgs,
  searchRegistry,
  slugToUuid,
} from "../companies";
import { dur, pts } from "../fmt";
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

/**
 * 「<暱稱> 邀請你加入 [公司 › 隊伍]」—— 三個入口(未登入/取代號/已有代號)共用,
 * 寫清楚是誰邀的、按下去會落在哪一間。舊連結(v16b 前)沒有隊伍,就是大廳
 */
function InviteHeadline({ invite }: { invite: Invite }) {
  return (
    <span className="text-crt-dim">
      <span className="text-crt-white">{invite.handle ?? t.inviteSomeone}</span>
      {t.invitePending}
      <span className="ml-1 inline-block px-bevel-in bg-crt-deep px-2 py-1">
        <span className="text-crt-gold">{invite.name ?? companyName(invite.code)}</span>
        <span className="text-crt-dim"> › </span>
        <span className="text-crt-white">{invite.team ?? t.lobby}</span>
      </span>
    </span>
  );
}

// invited:點邀請連結進來的。上面已經有「誰邀請你加入哪裡」,只留登入方式,其他介紹先收起來
function Login({ invited }: { invited: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {!invited && (
        <div>
          <h2 className="text-crt-white">{t.loginTitle}</h2>
          <p className="mt-1 text-crt-dim">{t.loginDesc}</p>
        </div>
      )}
      <div>
        <button onClick={() => signInWithGoogle()} className="px-btn w-full py-2.5 text-crt-gold">
          {t.loginGoogle}
        </button>
        <p className="mt-1.5 text-crt-dim">{t.loginGoogleHint}</p>
      </div>
      {sent ? (
        <p className="px-bevel-in bg-crt-deep px-3 py-2 text-crt-green">{t.loginSent}</p>
      ) : (
        <details className="px-small">
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
      {!invited && <p className="text-crt-dim">{t.loginPrivacy}</p>}
    </div>
  );
}

/**
 * 點邀請連結進來(已登入):只要確認暱稱、按「加入」。選公司、排行榜那些等加入或
 * 忽略之後才出現 —— 第一次來的人一次看到整頁,不知道該按哪裡。已經有暱稱的人帶入
 * 原本的(可以改);加入 = 換到邀請人的公司與隊伍
 */
function InviteJoin({
  invite,
  initialHandle,
  employment,
  onDone,
}: {
  invite: Invite;
  initialHandle: string;
  employment: Employment;
  onDone: () => void;
}) {
  const [handle, setHandle] = useState(initialHandle);
  const [busy, setBusy] = useState(false);
  const setCompanyLabel = useStore((s) => s.setCompanyLabel);
  const setPendingInvite = useStore((s) => s.setPendingInvite);
  const ok = !busy && handle.trim().length >= 1 && handle.trim().length <= 20;
  const join = () => {
    setBusy(true);
    setCompanyLabel(invite.name ?? companyName(invite.code));
    saveProfile(handle.trim(), invite.code, invite.team ?? null, employment).then(() => {
      setPendingInvite(null);
      onDone();
    });
  };
  return (
    <form
      className="px-panel flex flex-col gap-3 px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) join();
      }}
    >
      <InviteHeadline invite={invite} />
      <label className="flex flex-col gap-1">
        <span className="px-small text-crt-dim">{t.inviteHandle}</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={20}
          placeholder={t.setupHandlePlaceholder}
          className={input}
        />
      </label>
      <button type="submit" className={`${btn} w-full`} disabled={!ok}>
        {t.companyJoin}
      </button>
      <button
        type="button"
        onClick={() => setPendingInvite(null)}
        className="self-start px-small text-crt-dim hover:text-crt-white"
      >
        {t.inviteIgnore}
      </button>
    </form>
  );
}

/**
 * 取代號 + 選公司。公司從真實目錄選(或自訂),房間鍵由公司名決定性導出
 * —— 兩個同事各自選台積電就同房,不用互傳碼。DB 只存 uuid、不存公司名;
 * 自訂公司的顯示名只記在本機(setCompanyLabel)。
 * 有 onCancel = 從主畫面按「換公司」進來:不再問暱稱(改名在主畫面),最上面先列待過的地方
 */
function Setup({
  onDone,
  onCancel,
  initialHandle,
  here,
  places,
}: {
  onDone: () => void;
  onCancel?: () => void;
  initialHandle: string;
  here: { company_code: string | null; team: string | null; employment: Employment } | null;
  places: Place[];
}) {
  // 換公司時帶入現在的代號 —— 空著的話搜尋結果全是灰的按不下去,看起來像壞掉
  const [handle, setHandle] = useState(initialHandle);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const setCompanyLabel = useStore((s) => s.setCompanyLabel);
  const [registry, setRegistry] = useState<RegistryCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const ok = handle.trim().length >= 1 && handle.trim().length <= 20;
  const results = searchCompanies(query).slice(0, 8);
  const orgs = searchOrgs(query);

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

  // 自己選公司 = 從大廳開始(照邀請進來的走 InviteJoin)
  const join = (code: string, label: string) => {
    setCompanyLabel(label);
    saveProfile(handle.trim(), code, null).then(onDone);
  };
  // 回到待過的地方:公司、隊伍一起回去。同公司只是換隊,在職狀態不動;換公司就從在職開始(同 join)
  const goBack = (p: Place) => {
    setCompanyLabel(p.name);
    const employment = here && p.code === here.company_code ? here.employment : "current";
    saveProfile(handle.trim(), p.code, p.team, employment).then(onDone);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-crt-white">{onCancel ? t.changeCompany : t.setupTitle}</h2>
        {onCancel && (
          <button onClick={onCancel} className={btnGhost}>
            {t.cancel}
          </button>
        )}
      </div>
      {!onCancel && (
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={20}
          placeholder={t.setupHandlePlaceholder}
          className={input}
        />
      )}

      {/* 像切換工作區:現在這一處標「現在」,其他點一下就回去 */}
      {places.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-crt-dim">{t.placesTitle}</span>
          <ul className="flex flex-col gap-1">
            {places.map((p) => {
              const isHere = !!here && p.code === here.company_code && p.team === here.team;
              return (
                <li key={`${p.code}|${p.team ?? ""}`}>
                  <button
                    disabled={!ok || isHere}
                    onClick={() => goBack(p)}
                    className={`${isHere ? "px-row-me" : "px-row hover:bg-crt-bg disabled:opacity-40"} flex w-full items-center gap-2 px-3 py-2 text-left px-small`}
                  >
                    <span className="flex-1 truncate">
                      <span className="text-crt-gold">{p.name}</span>
                      <span className="text-crt-dim"> › </span>
                      <span className="text-crt-white">{p.team ?? t.lobby}</span>
                    </span>
                    {isHere && <span className="text-crt-dim">{t.placeHere}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
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
                className="px-row flex w-full items-center gap-2 px-3 py-2 text-left px-small text-crt-white hover:bg-crt-bg disabled:opacity-40"
              >
                <span className="flex-1">{c.name}</span>
                {c.aka && <span className="px-small text-crt-dim">{c.aka}</span>}
              </button>
            </li>
          ))}
        </ul>

        {/* 公司登記查不到的醫院與財團法人(orgs.ts)。跟登記公司一樣不具名 */}
        {orgs.length > 0 && (
          <>
            <span className="mt-1 px-small text-crt-dim">{t.companyOrgs}</span>
            <ul className="flex flex-col gap-1">
              {orgs.map((name) => (
                <li key={name}>
                  <button
                    disabled={!ok}
                    onClick={() => join(orgCode(name), name)}
                    className="px-row flex w-full items-center gap-2 px-3 py-2 text-left px-small text-crt-white hover:bg-crt-bg disabled:opacity-40"
                  >
                    <span className="flex-1">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {searching && <p className="px-small text-crt-dim">{t.companySearching}</p>}
        {registry.length > 0 && (
          <>
            <span className="mt-1 px-small text-crt-dim">{t.companyRegistry}</span>
            <ul className="flex flex-col gap-1">
              {registry.map((r) => (
                <li key={r.taxId}>
                  <button
                    disabled={!ok}
                    onClick={() => join(slugToUuid(r.taxId), r.name)}
                    className="px-row flex w-full items-center gap-2 px-3 py-2 text-left px-small text-crt-white hover:bg-crt-bg disabled:opacity-40"
                  >
                    <span className="flex-1">{r.name}</span>
                    <span className="px-small text-crt-dim">
                      {r.city} {r.taxId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* 三種都找不到:說清楚為什麼、該怎麼做 —— 自訂名稱要一字不差,邀請連結最準 */}
        {query.trim().length >= 2 &&
          !searching &&
          results.length === 0 &&
          orgs.length === 0 &&
          registry.length === 0 && <p className="px-small text-crt-gold">{t.companyNotFound}</p>}
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
    <div className="flex flex-wrap items-center gap-2 px-small">
      <span className="text-crt-dim">{t.employment}</span>
      <div className="flex gap-1">
        {(["current", "former"] as const).map((e) => (
          <button
            key={e}
            onClick={() => onChange(e)}
            className={`px-2.5 py-1 px-small ${
              value === e ? "px-bevel-in bg-crt-deep text-crt-white" : "text-crt-dim hover:text-crt-white"
            }`}
          >
            {e === "current" ? t.employmentCurrent : t.employmentFormer}
          </button>
        ))}
      </div>
      <span className="px-small text-crt-dim">{t.employmentHint}</span>
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
              className={`flex items-center gap-3 px-3 py-2 px-small ${
                r.company_code === myCode ? "px-row-me" : "px-row"
              }`}
            >
              <span className="w-5 text-right tabular-nums text-crt-dim">{i + 1}</span>
              <span className="flex-1 truncate text-crt-white">
                {/* 只有目錄公司具名;自訂公司即使湊滿 5 人也只顯示「其他公司」 */}
                {isDirectoryCompany(r.company_code) ? companyName(r.company_code) : t.crossOtherCompany}
              </span>
              <span className="text-crt-dim">{r.members} {t.membersUnit}</span>
              <span className="px-small tabular-nums text-amber-400/80">
                {t.perCap} {dur(r.perCap)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 px-small text-crt-dim">{t.crossCompanyHint}</p>
    </div>
  );
}

// onBack/onOffice 省略 = 這頁現在是登入閘門(App 在沒 session 時只給這頁),
// 沒有地方可以去,所以那兩顆按鈕不該畫出來
export default function Team({ onBack, onOffice }: { onBack?: () => void; onOffice?: () => void }) {
  const session = useSession();
  const companyLabel = useStore((s) => s.companyLabel);
  const pendingInvite = useStore((s) => s.pendingInvite);
  const setPendingInvite = useStore((s) => s.setPendingInvite);
  const team = useTeam(30_000);
  const [changing, setChanging] = useState(false);
  const [teamInput, setTeamInput] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [boardMine, setBoardMine] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const me = session?.user.id;
  const profile = team?.profile ?? null;
  const places = useStore((s) => s.places);
  const rememberPlace = useStore((s) => s.rememberPlace);

  // 記下現在待的公司/隊伍(只存本機),換公司時列出來。名字照畫面上顯示的記 ——
  // 換公司時 setCompanyLabel 先於 saveProfile,profile 換過來時標籤已經是新的
  useEffect(() => {
    if (me && profile?.company_code)
      rememberPlace({
        uid: me,
        code: profile.company_code,
        name: companyName(profile.company_code, useStore.getState().companyLabel),
        team: profile.team ?? null,
      });
  }, [me, profile?.company_code, profile?.team, rememberPlace]);

  // 已經在邀請的那一間(同公司、同隊:自己點自己的連結、或重複點)→ 邀請默默收掉。
  // 同公司但不同隊不收:那正是「進了公司卻在辦公室碰不到面」的情況,讓他一鍵換過去
  const inviteTeam = pendingInvite?.team ?? null;
  useEffect(() => {
    if (
      pendingInvite &&
      profile?.company_code === pendingInvite.code &&
      (profile?.team ?? null) === inviteTeam
    )
      setPendingInvite(null);
  }, [pendingInvite, inviteTeam, profile?.company_code, profile?.team, setPendingInvite]);

  // 還沒登入、手上有邀請:把邀請放回網址列。LINE、IG 這類 App 的內建瀏覽器會擋
  // Google 登入,使用者改用「以瀏覽器開啟」時帶走的就是這個網址 —— 一進站就洗掉的話,
  // 邀請留在內建瀏覽器裡跟著消失。這是「網址列什麼都沒有」唯一的例外:還沒登入的
  // 邀請畫面不是偽裝場景。登入之後照舊洗乾淨
  useEffect(() => {
    // 放 query 不放 hash:iOS 的 LINE 交給外部瀏覽器時會把 # 後面丟掉(見 companies.ts)
    if (session === null && pendingInvite) history.replaceState(null, "", `?${inviteParams(pendingInvite)}`);
    else if (session && (location.search + location.hash).includes("join="))
      history.replaceState(null, "", location.pathname);
  }, [session, pendingInvite]);

  // 手上的邀請(已經在那一間的,上面的 effect 會收掉;收掉之前也不畫,免得閃一下)
  const invite =
    pendingInvite &&
    !(profile?.company_code === pendingInvite.code && (profile?.team ?? null) === inviteTeam)
      ? pendingInvite
      : null;
  // 暱稱、公司都有了,也沒在換公司或看邀請 = 下面主畫面出現的條件
  const ready = !!profile?.company_code && !changing && !invite;

  const copyInvite = () => {
    if (!profile?.company_code) return;
    navigator.clipboard
      .writeText(
        buildInviteLink(location.origin, {
          code: profile.company_code,
          name: companyName(profile.company_code, companyLabel),
          handle: profile.handle,
          team: profile.team,
        }),
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
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[36px] text-crt-white">{t.team}</h1>
        <div className="flex items-center gap-2">
          {/* 該填的填好才能進;能進就閃,告訴剛加入的人下一步去哪 */}
          {onOffice && (
            <button
              onClick={onOffice}
              disabled={!ready}
              className={`${btnGhost} ${ready ? "px-nudge text-crt-gold" : ""}`}
            >
              {t.office}
            </button>
          )}
          {session && (
            <button onClick={() => signOut()} className={btnGhost}>
              {t.signOut}
            </button>
          )}
          {onBack && (
            <button onClick={onBack} className={btnGhost}>
              {t.back}
            </button>
          )}
        </div>
      </header>

      {!session && pendingInvite && (
        <div className="px-panel flex flex-col gap-1 px-3 py-2 px-small">
          <InviteHeadline invite={pendingInvite} />
          <span className="text-crt-dim">{t.inviteAfterLogin}</span>
        </div>
      )}
      {!session && <Login invited={!!pendingInvite} />}

      {session && team && invite && (
        <InviteJoin
          invite={invite}
          initialHandle={profile?.handle ?? ""}
          employment={profile?.employment ?? "current"}
          onDone={() => {
            setChanging(false);
            team.refresh();
          }}
        />
      )}

      {session && team && !invite && (!profile?.company_code || changing) && (
        <Setup
          initialHandle={profile?.handle ?? ""}
          here={profile}
          places={places.filter((p) => p.uid === me)}
          onCancel={changing ? () => setChanging(false) : undefined}
          onDone={() => {
            setChanging(false);
            team.refresh();
          }}
        />
      )}

      {session && profile?.company_code && !changing && !invite && (
        <>
          <div className="flex flex-wrap items-center gap-2 px-small">
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
          {/* 邀請連結會把對方帶到哪:跟你同公司、同隊。要換隊就先換好再按「邀請同事」 */}
          <p className="-mt-4 px-small text-crt-dim">
            {t.inviteWhere}
            <span className="text-crt-gold">{companyName(profile.company_code, companyLabel)}</span>
            {" › "}
            <span className="text-crt-white">{myTeam ?? t.lobby}</span>
          </p>
          {/* 本機開發版按出來的連結是 localhost,只有這台電腦打得開 —— 實測時很容易就這樣傳出去 */}
          {/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && (
            <p className="-mt-4 px-small text-crt-red">{t.inviteLocalhost}</p>
          )}

          <EmploymentToggle
            value={profile.employment}
            onChange={(e) => setEmployment(e).then(() => team!.refresh())}
          />

          {/* 只換暱稱,公司、隊伍、在職狀態照舊 —— 以前只能繞「換公司」,隊伍會被清回大廳 */}
          <div className="flex flex-wrap items-center gap-2 px-small">
            <span className="text-crt-dim">{t.myHandle}</span>
            <span className="px-bevel-in bg-crt-deep px-2 py-1 px-small text-crt-white">{profile.handle}</span>
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = handleInput.trim();
                if (!name || !profile) return;
                saveProfile(name, profile.company_code, profile.team, profile.employment).then(() => {
                  setHandleInput("");
                  team!.refresh();
                });
              }}
            >
              <input
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                maxLength={20}
                placeholder={t.setupHandlePlaceholder}
                className={`${input} min-w-40 flex-1`}
              />
              <button type="submit" className={btn} disabled={!handleInput.trim()}>
                {t.handleSave}
              </button>
            </form>
          </div>

          {/* 我的隊伍:標籤即隊伍,datalist 給既有隊名,打新名字就是開新隊 */}
          <div className="flex flex-wrap items-center gap-2 px-small">
            <span className="text-crt-dim">{t.myTeam}</span>
            {myTeam ? (
              <span className="px-bevel-in bg-crt-deep px-2 py-1 px-small text-crt-white">{myTeam}</span>
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

          <div className="px-panel px-4 py-3 px-small">
            <span className="text-crt-dim">{t.teamTotal} </span>
            <span className="tabular-nums text-crt-gold">{dur(team!.totalMs)}</span>
          </div>

          <CrossCompany myCode={profile.company_code} />

          {aggregates.length > 1 && (
            <div>
              <div className="mb-2 text-crt-dim">{t.teamVs}</div>
              <ul className="flex flex-col gap-1.5">
                {aggregates.map((a, i) => (
                  <li
                    key={a.team ?? "__lobby"}
                    className={`flex items-center gap-3 px-3 py-2 px-small ${
                      a.team === myTeam ? "px-row-me" : "px-row"
                    }`}
                  >
                    <span className="w-5 text-right tabular-nums text-crt-dim">{i + 1}</span>
                    <span className="flex-1 truncate text-crt-white">{teamTag(a.team)}</span>
                    <span className="text-crt-dim">{a.members} {t.membersUnit}</span>
                    <span className="tabular-nums text-crt-gold">{dur(a.totalMs)}</span>
                    <span className="px-small tabular-nums text-amber-400/80">
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
              <div className="flex gap-1 px-small">
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
                  <span className="w-5 text-right px-small tabular-nums text-crt-dim">{i + 1}</span>
                  <span className={`size-2 ${stateDot[r.state]}`} title={stateLabelOf()[r.state]} />
                  <span className="flex-1 truncate px-small text-crt-white">
                    {r.handle}
                    <span className="ml-2 bg-crt-deep px-1.5 py-0.5 px-small text-crt-dim">
                      {teamTag(r.team)}
                    </span>
                    {r.employment === "former" && (
                      <span className="ml-1 bg-crt-deep px-1.5 py-0.5 px-small text-crt-red">
                        {t.formerBadge}
                      </span>
                    )}
                  </span>
                  {r.fishes > 0 && (
                    <span className="px-small tabular-nums text-crt-dim" title={t.fishToday}>
                      🐟×{r.fishes}
                    </span>
                  )}
                  <span className="px-small tabular-nums text-crt-gold">{dur(r.weekMs)}</span>
                  {/* 偷到的摸魚幣。跟時數並列而不是取代它:名次仍然比時數,
                      這一格是「伺服器認可你真的賺到多少」。股市資產是另一本
                      帳,永遠不加進來 —— 分開才查得出作弊 */}
                  <span className="px-small tabular-nums text-crt-white" title={t.zoneHint}>
                    {pts.format(r.points)} {t.pointsUnit}
                  </span>
                  {r.userId !== me && r.latestEventId && (
                    <span className="flex gap-0.5">
                      {EMOJIS.slice(0, 3).map((e) => (
                        <button
                          key={e}
                          title={e}
                          className="px-1 px-small opacity-60 hover:opacity-100"
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
