import { useState } from "react";
import type {
  HardcodedTextIssue,
  IssueBaselineReport,
  TranslateFn,
} from "../types/translations";

type StatusBarProps = {
  t: TranslateFn;
  loadingError: string | null;
  saveError: string | null;
  hardcodedTextCount?: number;
  hardcodedTextPreview?: string[];
  hardcodedTextIssues?: HardcodedTextIssue[];
  staleData: boolean;
  hasUnsavedChanges: boolean;
  changedKeyCount?: number;
  issueBaseline?: IssueBaselineReport | null;
  lastSavedAt: Date | null;
  onRefresh: () => void | Promise<void>;
  onReviewChanges?: () => void;
};

export default function StatusBar({
  t,
  loadingError,
  saveError,
  hardcodedTextCount = 0,
  hardcodedTextPreview = [],
  hardcodedTextIssues = [],
  staleData,
  hasUnsavedChanges,
  changedKeyCount = 0,
  issueBaseline = null,
  lastSavedAt,
  onRefresh,
  onReviewChanges,
}: StatusBarProps) {
  const [showHardcodedLocations, setShowHardcodedLocations] = useState(false);
  const errorMessage = loadingError ?? saveError;
  const hasHardcodedSignal =
    hardcodedTextCount > 0 || hardcodedTextPreview.length > 0;
  const showLocations = hasHardcodedSignal && showHardcodedLocations;
  const baselineDeltas = issueBaseline?.delta;
  const baselineAdded = baselineDeltas
    ? Math.max(0, baselineDeltas.missingTranslations) +
      Math.max(0, baselineDeltas.orphanKeys) +
      Math.max(0, baselineDeltas.invalidKeys) +
      Math.max(0, baselineDeltas.placeholderMismatches) +
      Math.max(0, baselineDeltas.hardcodedTexts)
    : 0;
  const baselineResolved = baselineDeltas
    ? Math.max(0, -baselineDeltas.missingTranslations) +
      Math.max(0, -baselineDeltas.orphanKeys) +
      Math.max(0, -baselineDeltas.invalidKeys) +
      Math.max(0, -baselineDeltas.placeholderMismatches) +
      Math.max(0, -baselineDeltas.hardcodedTexts)
    : 0;
  const showBaselineDelta =
    Boolean(issueBaseline?.hasPrevious) &&
    (baselineAdded > 0 || baselineResolved > 0);

  const savedAtLabel =
    lastSavedAt ?
      t("savedAt", {
        time: lastSavedAt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      })
    : null;

  if (
    !errorMessage &&
    !staleData &&
    !hasUnsavedChanges &&
    !savedAtLabel &&
    !hasHardcodedSignal &&
    !showBaselineDelta &&
    changedKeyCount === 0
  ) {
    return null;
  }

  return (
    <div className="status-bar" role="status" aria-live="polite">
      {errorMessage ? (
        <p className="status-bar__main status-bar__main--error">{errorMessage}</p>
      ) : staleData ? (
        <div className="status-bar__main status-bar__main--warning">
          <span>{t("stalePrompt")}</span>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onRefresh}
          >
            {t("refresh")}
          </button>
        </div>
      ) : savedAtLabel ? (
        <p className="status-bar__main status-bar__main--success">{savedAtLabel}</p>
      ) : hasUnsavedChanges ? (
        <p className="status-bar__main status-bar__main--info">{t("unsavedChanges")}</p>
      ) : (
        null
      )}

      <div className="status-bar__meta">
        <button
          type="button"
          className={
            hardcodedTextCount > 0
              ? "status-chip status-chip--warning"
              : "status-chip status-chip--muted"
          }
          title={hardcodedTextPreview.join("\n")}
          onClick={() =>
            setShowHardcodedLocations((current) =>
              hasHardcodedSignal ? !current : false,
            )
          }
        >
          {t("hardcodedTextStatus", { count: hardcodedTextCount })}
          {hasHardcodedSignal ? (
            <span className="status-chip__action">
              {showHardcodedLocations
                ? t("hardcodedTextHideLocations")
                : t("hardcodedTextShowLocations")}
            </span>
          ) : null}
        </button>
        {changedKeyCount > 0 ? (
          <>
            <span className="status-chip status-chip--muted">
              {t("changedKeysStatus", { count: changedKeyCount })}
            </span>
            {onReviewChanges ? (
              <button
                type="button"
                className="status-chip status-chip--info"
                onClick={onReviewChanges}
              >
                {t("reviewChanges", { count: changedKeyCount })}
              </button>
            ) : null}
          </>
        ) : null}
        {showBaselineDelta ? (
          <span className="status-chip status-chip--muted">
            {t("baselineDeltaStatus", {
              added: baselineAdded,
              resolved: baselineResolved,
            })}
          </span>
        ) : null}
        {hasUnsavedChanges && <span className="status-chip">{t("unsavedChanges")}</span>}
      </div>
      {showLocations ? (
        <div className="status-bar__details">
          <strong>{t("hardcodedTextLocations")}</strong>
          {hardcodedTextIssues.length === 0 ? (
            <p>{t("hardcodedTextNoLocations")}</p>
          ) : (
            <ul>
              {hardcodedTextIssues.map((issue) => (
                <li key={`${issue.file}:${issue.line}:${issue.kind}:${issue.text}`}>
                  <code>{issue.file}:{issue.line}</code> <span>[{issue.kind}]</span>{" "}
                  {issue.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
