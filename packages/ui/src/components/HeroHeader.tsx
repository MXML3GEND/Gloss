import type { UiLanguage } from "../i18n";
import type { TranslateFn } from "../types/translations";

type CommunityLinks = {
  repo: string;
  issues: string;
};

type HeroHeaderProps = {
  t: TranslateFn;
  uiLanguage: UiLanguage;
  onChangeLanguage: (language: UiLanguage) => void;
  localeCount: number;
  keyCount: number;
  missingCount: number;
  communityLinks: CommunityLinks;
};

export default function HeroHeader({
  t,
  uiLanguage,
  onChangeLanguage,
  localeCount,
  keyCount,
  missingCount,
  communityLinks,
}: HeroHeaderProps) {
  return (
    <header className="hero">
      <div className="hero__top">
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
      <img className="hero__logo" src="/logo_full.png" alt="Gloss" />
      <p className="hero__summary">{t("heroSummary")}</p>

      <div className="hero__stats">
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

      <div className="hero__actions">
        <a
          className="btn btn--primary"
          href={communityLinks.repo}
          target="_blank"
          rel="noreferrer"
        >
          {t("sourceCode")}
        </a>
        <a
          className="btn btn--ghost"
          href={communityLinks.issues}
          target="_blank"
          rel="noreferrer"
        >
          {t("reportIssue")}
        </a>
      </div>
    </header>
  );
}
