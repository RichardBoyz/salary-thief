// 使用說明 / 新手教學。第一次開 app 自動顯示(store.helpSeen),之後從
// 主畫面「說明」叫回來。不裝導覽套件:四個畫面的 app 用 spotlight tour
// 是過度工程,而且現代風 tooltip 會打壞像素臉。
import { t } from "../strings";

export default function Help({ onClose }: { onClose: () => void }) {
  // 放 render 內不放 module scope:t 會原地換語言,抄出去就凍住舊語言
  const SECTIONS: [string, string][] = [
    [t.helpWhat, t.helpWhatBody],
    [t.helpSetup, t.helpSetupBody],
    [t.helpSlack, t.helpSlackBody],
    [t.helpOffice, t.helpOfficeBody],
    [t.helpTeam, t.helpTeamBody],
    [t.helpPrivacy, t.helpPrivacyBody],
  ];
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-[36px] text-crt-white">{t.helpTitle}</h1>
        <button onClick={onClose} className="px-btn">
          {t.back}
        </button>
      </header>

      {SECTIONS.map(([title, body], i) => (
        <section key={i} className="px-panel px-4 py-3">
          <h2 className="text-crt-gold">{title}</h2>
          <p className="mt-1.5 leading-relaxed text-crt-dim">{body}</p>
        </section>
      ))}

      <button onClick={onClose} className="px-btn py-3 text-crt-gold">
        {t.helpStart}
      </button>
    </div>
  );
}
