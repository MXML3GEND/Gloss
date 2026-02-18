import type { TranslateFn } from "../types/translations";
import type { WorkspaceMode } from "../types/translations";

type ActionSidebarProps = {
  t: TranslateFn;
  workspaceMode: WorkspaceMode;
  activeView: "translations" | "issues" | "duplicates" | "usage";
  onChangeView: (view: "translations" | "issues" | "duplicates") => void;
  onSearch: () => void;
  onAddKey: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
};

export default function ActionSidebar({
  t,
  workspaceMode,
  activeView,
  onChangeView,
  onSearch,
  onAddKey,
  onSave,
  saveDisabled,
  saving,
}: ActionSidebarProps) {
  const isAnalyzeMode = workspaceMode === "maintenance";

  return (
    <aside className="action-sidebar" aria-label={t("sidebarActionsLabel")}>
      <div className="action-sidebar__group">
        <button
          type="button"
          className={
            activeView === "translations" || activeView === "usage"
              ? "action-sidebar__btn is-active"
              : "action-sidebar__btn"
          }
          aria-label={t("tabTranslations")}
          title={t("tabTranslations")}
          onClick={() => onChangeView("translations")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M4 5h16a1 1 0 0 1 1 1v3H3V6a1 1 0 0 1 1-1Zm-1 6h18v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7Zm3 2v2h5v-2H6Zm7 0v2h5v-2h-5Z"
            />
          </svg>
        </button>
        {isAnalyzeMode ? (
          <button
            type="button"
            className={
              activeView === "issues"
                ? "action-sidebar__btn is-active"
                : "action-sidebar__btn"
            }
            aria-label={t("tabIssuesInbox")}
            title={t("tabIssuesInbox")}
            onClick={() => onChangeView("issues")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M12.87 3.5a1 1 0 0 0-1.74 0L2.3 18.5A1 1 0 0 0 3.17 20h17.66a1 1 0 0 0 .87-1.5L12.87 3.5ZM12 16a1.25 1.25 0 1 1 0 2.5A1.25 1.25 0 0 1 12 16Zm1-2.75h-2V9h2v4.25Z"
              />
            </svg>
          </button>
        ) : null}
        {isAnalyzeMode ? (
          <button
            type="button"
            className={
              activeView === "duplicates"
                ? "action-sidebar__btn is-active"
                : "action-sidebar__btn"
            }
            aria-label={t("tabDuplicateValues")}
            title={t("tabDuplicateValues")}
            onClick={() => onChangeView("duplicates")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M7 7h10v10H7zM5 5h10v2H7v8H5zm4 12h10V7h2v12H9z"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="action-sidebar__group">
        <button
          type="button"
          className="action-sidebar__btn"
          aria-label={t("sidebarSearch")}
          title={t("sidebarSearch")}
          onClick={onSearch}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="m20.71 19.29-4.4-4.39A7 7 0 1 0 15 16.31l4.39 4.4a1 1 0 0 0 1.42-1.42ZM5 10a5 5 0 1 1 5 5 5 5 0 0 1-5-5Z"
            />
          </svg>
        </button>
        <button
          type="button"
          className="action-sidebar__btn"
          aria-label={t("sidebarAddQuick")}
          title={t("sidebarAddQuick")}
          onClick={onAddKey}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1Z"
            />
          </svg>
        </button>
        <button
          type="button"
          className={
            saving ? "action-sidebar__btn action-sidebar__btn--saving" : "action-sidebar__btn"
          }
          aria-label={saving ? t("saving") : t("save")}
          title={saving ? t("saving") : t("save")}
          onClick={onSave}
          disabled={saveDisabled}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M5 3h11l3 3v15H5V3Zm2 2v4h8V5H7Zm0 14h10v-8H7v8Zm2-2h6v-4H9v4Z"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}
