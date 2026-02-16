import type { TranslateFn } from "../types/translations";

type StatusBarProps = {
  t: TranslateFn;
  loadingError: string | null;
  saveError: string | null;
  staleData: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: Date | null;
  onRefresh: () => void | Promise<void>;
};

export default function StatusBar({
  t,
  loadingError,
  saveError,
  staleData,
  hasUnsavedChanges,
  lastSavedAt,
  onRefresh,
}: StatusBarProps) {
  const errorMessage = loadingError ?? saveError;
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

  if (!errorMessage && !staleData && !hasUnsavedChanges && !savedAtLabel) {
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
      ) : (
        <p className="status-bar__main status-bar__main--info">{t("unsavedChanges")}</p>
      )}

      <div className="status-bar__meta">
        {hasUnsavedChanges && <span className="status-chip">{t("unsavedChanges")}</span>}
        {savedAtLabel && <span className="status-chip status-chip--muted">{savedAtLabel}</span>}
      </div>
    </div>
  );
}
