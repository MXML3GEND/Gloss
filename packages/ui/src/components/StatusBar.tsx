import { useState } from "react";
import type { HardcodedTextIssue, TranslateFn } from "../types/translations";

type StatusBarProps = {
  t: TranslateFn;
  loadingError: string | null;
  saveError: string | null;
  hardcodedTextCount?: number;
  hardcodedTextPreview?: string[];
  hardcodedTextIssues?: HardcodedTextIssue[];
  staleData: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: Date | null;
  onRefresh: () => void | Promise<void>;
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
  lastSavedAt,
  onRefresh,
}: StatusBarProps) {
  const [showHardcodedLocations, setShowHardcodedLocations] = useState(false);
  const errorMessage = loadingError ?? saveError;
  const hasHardcodedSignal =
    hardcodedTextCount > 0 || hardcodedTextPreview.length > 0;
  const showLocations = hasHardcodedSignal && showHardcodedLocations;

  const savedAtLabel =
    lastSavedAt ?
      t("savedAt", {
        time: lastSavedAt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      })
    : null;

  if (
    !errorMessage &&
    !staleData &&
    !hasUnsavedChanges &&
    !savedAtLabel &&
    !hasHardcodedSignal
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
        {hasUnsavedChanges && <span className="status-chip">{t("unsavedChanges")}</span>}
        {savedAtLabel && <span className="status-chip status-chip--muted">{savedAtLabel}</span>}
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
