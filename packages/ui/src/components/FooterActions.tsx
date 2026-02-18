import type { TranslateFn } from "../types/translations";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";

type CommunityLinks = {
  repo: string;
  issues: string;
};

type FooterActionsProps = {
  t: TranslateFn;
  locales: string[];
  defaultLocale: string;
  onExportXliff: (locale: string) => Promise<void>;
  onImportXliff: (locale: string, content: string) => Promise<void>;
  communityLinks: CommunityLinks;
};

export default function FooterActions({
  t,
  locales,
  defaultLocale,
  onExportXliff,
  onImportXliff,
  communityLinks,
}: FooterActionsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedXliffLocale, setSelectedXliffLocale] = useState(
    locales.includes(defaultLocale) ? defaultLocale : (locales[0] ?? ""),
  );
  const xliffLocale =
    selectedXliffLocale && locales.includes(selectedXliffLocale)
      ? selectedXliffLocale
      : locales.includes(defaultLocale)
        ? defaultLocale
        : (locales[0] ?? "");

  const handleOpenImport = () => {
    if (!xliffLocale) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !xliffLocale) {
      return;
    }

    const content = await file.text();
    await onImportXliff(xliffLocale, content);
  };

  return (
    <div className="footer-actions">
      <div className="footer-actions__meta">
        <p className="footer-actions__summary">{t("heroSummary")}</p>
        <div className="footer-actions__xliff">
          <span className="footer-actions__xliff-label">{t("xliffLabel")}</span>
          <label className="footer-actions__xliff-field">
            <span>{t("xliffLocale")}</span>
            <select
              value={xliffLocale}
              onChange={(event) => setSelectedXliffLocale(event.target.value)}
              disabled={locales.length === 0}
            >
              {locales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => void onExportXliff(xliffLocale)}
            disabled={!xliffLocale}
          >
            {t("xliffExport")}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={handleOpenImport}
            disabled={!xliffLocale}
          >
            {t("xliffImport")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlf,.xliff,application/xliff+xml,text/xml,application/xml"
            className="footer-actions__file-input"
            onChange={(event) => void handleImportFile(event)}
          />
        </div>
        <div className="footer-actions__links">
          <a
            className="btn btn--ghost btn--small"
            href={communityLinks.repo}
            target="_blank"
            rel="noreferrer"
          >
            {t("sourceCode")}
          </a>
          <a
            className="btn btn--ghost btn--small"
            href={communityLinks.issues}
            target="_blank"
            rel="noreferrer"
          >
            {t("reportIssue")}
          </a>
        </div>
      </div>
    </div>
  );
}
