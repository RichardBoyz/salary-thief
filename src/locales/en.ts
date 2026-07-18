import type { Strings } from "./zh-TW";

// 英文。型別 Strings 強制對齊 zh-TW 的每個 key —— 漏一個就編譯失敗。
export const en: Strings = {
  appName: "Salary Thief",

  todayEarned: "Earned today",
  perSecond: "Per second",
  untilOffWork: "Until clock-out",
  dailyPay: "Today's pay",
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
    "Arrow keys / WASD to move — reach the pantry or couch to start slacking, back to your desk to stop.",

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
  companyCustomHint: "Not listed? Type the full name to open your own room:",
  companyCustomPlaceholder: "Full company name (coworkers who type the same land together)",
  companyJoin: "Join",
  companyMine: "Your company",
  companyDirectoryOnly:
    "Only listed companies appear named in cross-company stats; custom ones are never named.",
  companyPrivacy:
    "Picking a company only matches you with coworkers. The DB stores no company name; your records only tie to a nickname.",
  copyCode: "Copy code",
  copied: "Copied",

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
  noTeammates: "You're the only one here. Share the company with a coworker.",

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
  fishNeedLogin: "Log in and 8 fish spots appear randomly in the office each day.",

  stats: "Slacking report",
  monthSlack: "This month",
  stolen: "Money stolen",
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
  autoDisguiseHint: "Alt-tab away and it flips to a spreadsheet; press Esc when you're back.",
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
