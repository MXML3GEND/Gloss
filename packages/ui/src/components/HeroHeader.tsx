import type { UiLanguage } from "../i18n";
import type { TranslateFn } from "../types/translations";

type HeroHeaderProps = {
  t: TranslateFn;
  uiLanguage: UiLanguage;
  onChangeLanguage: (language: UiLanguage) => void;
  localeCount: number;
  keyCount: number;
  missingCount: number;
};

export default function HeroHeader({
  t,
  uiLanguage,
  onChangeLanguage,
  localeCount,
  keyCount,
  missingCount,
}: HeroHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__main">
        <div className="app-header__brand" aria-label="Gloss">
          <img className="app-header__logo" src="/logo_full.png" alt="Gloss" style={{ height: "40px", width: "auto" }} />
        </div>

        <div className="app-header__stats">
          <div className="stat-chip">
            <span>{t("localeLabel")}</span>
            <strong>{localeCount}</strong>
          </div>
          <div className="stat-chip">
            <span>{t("keysLabel")}</span>
            <strong>{keyCount}</strong>
          </div>
          <div className="stat-chip">
            <span>{t("missingLabel")}</span>
            <strong>{missingCount}</strong>
          </div>
        </div>

        <div className="app-header__controls">
          <div className="language-switch" aria-label={t("languageLabel")}>
            <button
              type="button"
              className={
                uiLanguage === "en"
                  ? "btn btn--ghost btn--small is-active"
                  : "btn btn--ghost btn--small"
              }
              onClick={() => onChangeLanguage("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={
                uiLanguage === "nl"
                  ? "btn btn--ghost btn--small is-active"
                  : "btn btn--ghost btn--small"
              }
              onClick={() => onChangeLanguage("nl")}
            >
              NL
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
