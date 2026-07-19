import type { Strings } from "./zh-TW";

// 英文。型別 Strings 強制對齊 zh-TW 的每個 key —— 漏一個就編譯失敗。
export const en: Strings = {
  appName: "Salary Thief",

  todayStolen: "Stolen today",
  todaySlack: "Slacked today",
  untilOffWork: "Until clock-out",
  weekSlack: "Slacked this week",
  progressOfDay: "Day's progress",

  stateBefore: "Not on the clock",
  stateWorking: "On the clock",
  stateLunch: "Lunch break",
  stateAfter: "Off the clock",

  quipBefore: "Shift hasn't started. Right now you're free labor's opposite — free.",
  quipWorking: "Every second, turning time into money.",
  quipLunch: "Lunch isn't paid. Right now the boss owes you nothing.",
  quipAfter: "Today's cut is all yours. You can go.",

  disguiseTitle: "Q3_forecast_v7_FINAL_revised.xlsx - Excel",
  bossKeyHint: "Esc to look busy",

  startSlacking: "Start slacking",
  stopSlacking: "Stop slacking",

  office: "Office",
  officeSlacking: "Slacking",
  officeHint:
    "Arrow keys / WASD to move — the pantry or couch logs slack hours, your desk stops it. Money is earned in the green box: it only ticks while you stand inside, and it moves every 10 minutes; catching fish adds a bonus.",
  zoneHint: "Money stolen = time standing in the green box + fish bonuses (one fish = 15 minutes of pay).",

  team: "Team",
  loginTitle: "Steal together",
  loginDesc: "Log in to team up: who's slacking, this week's board, razz each other.",
  loginGoogle: "Sign in with Google",
  loginGoogleHint: "It'll ask which account — pick your personal one, not your work one.",
  loginOr: "No Google? Get a magic link by email:",
  loginEmailPlaceholder: "Personal email (not your work one)",
  loginSend: "Send link",
  loginSent: "Sent. Click the link in your inbox to come back. Check spam if it's missing.",
  loginPrivacy:
    "Email login, no password. Your salary and earnings never upload — the board only compares hours.",
  setupTitle: "Pick a codename",
  setupHandlePlaceholder: "Nickname (recognizable to coworkers, not to the boss)",

  companyPick: "Pick your company",
  companySearch: "Search company (TSMC, Foxconn…)",
  companyRegistry: "Registered companies (MOEA registry, matches the registered full name):",
  companySearching: "Searching the registry…",
  companyCustomHint: "Not listed? Type the full name to open your own room:",
  companyCustomPlaceholder: "Full company name (coworkers who type the same land together)",
  companyJoin: "Join",
  companyMine: "Your company",
  companyDirectoryOnly:
    "Only listed companies appear named in cross-company stats; custom ones are never named.",
  companyPrivacy:
    "Picking a company only matches you with coworkers. The DB stores no company name; your records only tie to a nickname.",
  invite: "Invite coworkers",
  copied: "Copied",
  invitePending: "A coworker invited you to",
  inviteIgnore: "Ignore",
  inviteAfterLogin: "Sign in and you'll join the room your coworker invited you to.",

  employment: "Status",
  employmentCurrent: "Current",
  employmentFormer: "Former",
  employmentHint: "Former employees drop out of company stats, but your own log stays.",
  formerBadge: "Former",

  crossCompany: "Companies this week",
  crossCompanyHint: "Only companies with 5+ people, aggregate only, never naming individuals. Ranked per capita.",
  crossCompanyEmpty:
    "No company has hit 5 people yet — round up 5 coworkers and yours makes the board.",
  crossOtherCompany: "Other company",
  weekBoard: "This week's board",
  boardAll: "All",
  boardMine: "My team",
  teamTotal: "Company stole this week",
  teamTotalPrivate: "at your rate ≈ ",
  onlyYouSee: "(only you see this)",
  received: "You got razzed",
  stateOffline: "Offline",
  refresh: "Refresh",
  signOut: "Sign out",
  changeCompany: "Change company",
  noTeammates: "You're the only one here. Hit \"Invite coworkers\" and share the link.",

  lobby: "Lobby",
  myTeam: "My team",
  teamNone: "No team yet — you're in the lobby.",
  teamPickPlaceholder: "Team name, e.g. Backend (a new name opens a new team)",
  teamSave: "Join",
  teamVs: "Team vs team (this week, per capita)",
  perCap: "per cap",
  membersUnit: "",

  visitTabs: "Visiting",
  visitHint: "You're visiting another team's room — people here can't see you, and moving won't start slacking.",
  yourRoomSuffix: "(yours)",

  fishHere: "A fish appeared! Stand on the 🐟 to catch it",
  fishNext: "Next fish",
  fishNone: "Today's fish all swam off. Come back tomorrow.",
  fishToday: "Caught today",
  fishNeedLogin: "Log in and 8 fish spots appear randomly each day — one fish pays 15 minutes of wage.",

  help: "Help",
  helpTitle: "How to use",
  helpStart: "Got it — start slacking",
  helpWhat: "What is this?",
  helpWhatBody:
    "Slacking, gamified: hours go into your report and the leaderboard, but money is earned in person in the 2D office — stand in the bonus box, catch fish. Every amount is computed for your eyes only; your salary never leaves this device.",
  helpSetup: "Step one: set your pay",
  helpSetupBody:
    "Open Settings and fill in monthly salary, workdays per month, shift and lunch times — your per-second rate comes from these. Everything stays in this browser's localStorage.",
  helpSlack: "Log your slack hours",
  helpSlackBody:
    "Hit \"Start slacking\" to log hours, stop when you're done — hours feed the report's heatmap and the team leaderboard. Note: the timer doesn't mint money; the big number is earned in the office (next section).",
  helpBoss: "Boss incoming",
  helpBossBody:
    "Press Esc (mobile: double-tap the screen) to flip into a fake Excel sheet — tab title and favicon change too. By default it auto-disguises the moment you tab away; press Esc or double-tap to come back. Toggle in Settings.",
  helpOffice: "The office — where money is made",
  helpOfficeBody:
    "Move with arrows / WASD or tap a tile. \"Stolen today\" has exactly two sources: standing in the green box accrues at your wage rate (it moves every 10 minutes), and after signing in, 8 daily fish spots — stand on one to catch 🐟, one fish = 15 minutes of pay. The pantry or couch also logs slack hours; your desk stops the clock.",
  helpTeam: "Bring coworkers",
  helpTeamBody:
    "In Team, sign in with a personal email (never the work one), pick a handle and a company — from the directory, the business registry, or a custom name; hit \"Invite coworkers\" and share the link — they open it, sign in, and land in your room. The board ranks hours, never money.",
  helpPrivacy: "Privacy floor",
  helpPrivacyBody:
    "Salary and amounts are never uploaded; the database stores no company names, only opaque codes; handles aren't tied to real names. The screen also never shows daily pay or per-second rate — passers-by can't work out what you earn.",

  stats: "Slacking report",
  monthSlack: "This month",
  stolen: "Hours × wage",
  longest: "Longest run",
  sessions: "Sessions",
  heatmap: "Last 12 weeks",
  less: "less",
  more: "more",
  noSlackData: "No slacking logged yet. Hit “Start slacking” and it'll pile up.",
  slackedFor: "slacked",

  settings: "Settings",
  back: "Back",
  lang: "Language",
  autoDisguise: "Auto-disguise when tab loses focus",
  autoDisguiseHint: "Alt-tab away and it flips to a spreadsheet; press Esc or double-tap to come back.",
  monthlySalary: "Monthly salary",
  workdaysPerMonth: "Workdays per month",
  shiftStart: "Clock in",
  shiftEnd: "Clock out",
  lunchStart: "Lunch start",
  lunchMinutes: "Lunch length (min)",
  settingsHint: "Data lives only in this browser, on this device. Nothing uploads.",
  errShiftOrder: "Clock-out must be later than clock-in.",
  errLunchTooLong: "Lunch is longer than the whole shift.",
};
