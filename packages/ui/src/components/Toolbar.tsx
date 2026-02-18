import { useMemo, useState } from "react";
import type {
  KeyUsagePage,
  TranslateFn,
  WorkspaceMode,
} from "../types/translations";

type ToolbarProps = {
  t: TranslateFn;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  filterValue: string;
  onFilterChange: (value: string) => void;
  groupByNamespace: boolean;
  onGroupByNamespaceChange: (value: boolean) => void;
  showExplorers: boolean;
  onShowExplorersChange: (value: boolean) => void;
  gitBaseRef: string;
  onGitBaseRefChange: (value: string) => void;
  gitDiffAvailable: boolean;
  gitDiffError: string | null;
  usagePages: KeyUsagePage[];
  selectedPage: string;
  onSelectedPageChange: (value: string) => void;
};

const tokenizeSearch = (query: string) =>
  query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

export default function Toolbar({
  t,
  workspaceMode,
  onWorkspaceModeChange,
  filterValue,
  onFilterChange,
  groupByNamespace,
  onGroupByNamespaceChange,
  showExplorers,
  onShowExplorersChange,
  gitBaseRef,
  onGitBaseRefChange,
  gitDiffAvailable,
  gitDiffError,
  usagePages,
  selectedPage,
  onSelectedPageChange,
}: ToolbarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isMaintenanceMode = workspaceMode === "maintenance";
  const searchTokens = useMemo(() => tokenizeSearch(filterValue), [filterValue]);
  const activeDslTokens = useMemo(
    () => searchTokens.filter((token) => token.includes(":")),
    [searchTokens],
  );
  const hasMissingToken = useMemo(
    () =>
      searchTokens.some((token) => token.toLowerCase() === "missing:true"),
    [searchTokens],
  );
  const hasChangedToken = useMemo(
    () =>
      searchTokens.some((token) => token.toLowerCase() === "changed:true"),
    [searchTokens],
  );
  const hasUnusedToken = useMemo(
    () =>
      searchTokens.some((token) => token.toLowerCase() === "unused:true"),
    [searchTokens],
  );
  const hasPlaceholderMismatchToken = useMemo(
    () =>
      searchTokens.some(
        (token) => token.toLowerCase() === "placeholdermismatch:true",
      ),
    [searchTokens],
  );
  const advancedCount =
    Number(groupByNamespace) +
    Number(isMaintenanceMode && showExplorers) +
    Number(isMaintenanceMode && selectedPage !== "all");

  const selectedPageLabel =
    selectedPage === "all"
      ? null
      : usagePages.find((page) => page.id === selectedPage)?.file ?? selectedPage;

  const upsertBooleanDslToken = (name: string, enabled: boolean) => {
    const prefix = `${name.toLowerCase()}:`;
    const nextTokens = searchTokens.filter(
      (token) => !token.toLowerCase().startsWith(prefix),
    );
    if (enabled) {
      nextTokens.push(`${name}:true`);
    }
    onFilterChange(nextTokens.join(" "));
  };

  const removeDslToken = (tokenToRemove: string) => {
    const index = searchTokens.findIndex((token) => token === tokenToRemove);
    if (index === -1) {
      return;
    }
    const nextTokens = [...searchTokens];
    nextTokens.splice(index, 1);
    onFilterChange(nextTokens.join(" "));
  };

  return (
    <div className={isMaintenanceMode ? "toolbar" : "toolbar toolbar--translate"}>
      <div className="toolbar__top">
        <div className="toolbar__mode-group">
          <div
            className="toolbar__mode-switch"
            role="group"
            aria-label={t("workspaceMode")}
          >
            <button
              type="button"
              className={
                workspaceMode === "translate"
                  ? "btn btn--ghost btn--small is-active"
                  : "btn btn--ghost btn--small"
              }
              onClick={() => onWorkspaceModeChange("translate")}
            >
              {t("modeTranslate")}
            </button>
            <button
              type="button"
              className={
                workspaceMode === "maintenance"
                  ? "btn btn--ghost btn--small is-active"
                  : "btn btn--ghost btn--small"
              }
              onClick={() => onWorkspaceModeChange("maintenance")}
            >
              {t("modeMaintenance")}
            </button>
          </div>
          <p className="toolbar__mode-hint">
            {workspaceMode === "translate"
              ? t("modeTranslateHint")
              : t("modeMaintenanceHint")}
          </p>
        </div>

        <label className="toolbar__field toolbar__field--search">
          <input
            aria-label={t("filterKeys")}
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder={t("filterKeysPlaceholder")}
          />
        </label>

        <div className="toolbar__actions">
          <button
            type="button"
            className={
              showAdvanced
                ? "btn btn--ghost btn--small is-active"
                : "btn btn--ghost btn--small"
            }
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {advancedCount > 0
              ? `${t("advancedQuery")} (${advancedCount})`
              : t("advancedQuery")}
          </button>
        </div>
      </div>

      <div className="toolbar__chips" role="group" aria-label={t("advancedQuery")}>
        <button
          type="button"
          className={hasMissingToken ? "filter-chip is-active" : "filter-chip"}
          aria-label={t("showOnlyMissing")}
          aria-pressed={hasMissingToken}
          onClick={() => upsertBooleanDslToken("missing", !hasMissingToken)}
        >
          {t("showOnlyMissing")}
        </button>
        {isMaintenanceMode ? (
          <button
            type="button"
            className={hasChangedToken ? "filter-chip is-active" : "filter-chip"}
            aria-label={t("showOnlyGitChanged")}
            aria-pressed={hasChangedToken}
            onClick={() => upsertBooleanDslToken("changed", !hasChangedToken)}
          >
            {t("showOnlyGitChanged")}
          </button>
        ) : null}
        {isMaintenanceMode ? (
          <button
            type="button"
            className={hasUnusedToken ? "filter-chip is-active" : "filter-chip"}
            aria-label={t("statusUnused")}
            aria-pressed={hasUnusedToken}
            onClick={() => upsertBooleanDslToken("unused", !hasUnusedToken)}
          >
            {t("statusUnused")}
          </button>
        ) : null}
        {isMaintenanceMode ? (
          <button
            type="button"
            className={
              hasPlaceholderMismatchToken ? "filter-chip is-active" : "filter-chip"
            }
            aria-label={t("placeholderMismatchTag")}
            aria-pressed={hasPlaceholderMismatchToken}
            onClick={() =>
              upsertBooleanDslToken(
                "placeholderMismatch",
                !hasPlaceholderMismatchToken,
              )
            }
          >
            {t("placeholderMismatchTag")}
          </button>
        ) : null}
        {filterValue.trim().length > 0 ? (
          <button
            type="button"
            className="filter-chip filter-chip--clear"
            onClick={() => onFilterChange("")}
          >
            {t("clearFilters")}
          </button>
        ) : null}
      </div>

      {activeDslTokens.length > 0 ? (
        <div className="toolbar__token-list" role="list" aria-label={t("advancedQuery")}>
          {activeDslTokens.map((token) => (
            <button
              key={token}
              type="button"
              className="toolbar__token"
              onClick={() => removeDslToken(token)}
              title={t("delete")}
            >
              <span>{token}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <p className="toolbar__mode-hint toolbar__dsl-hint">{t("filterDslHint")}</p>

      {showAdvanced ? (
        <div className="toolbar__advanced">
          {isMaintenanceMode && !gitDiffAvailable && gitDiffError ? (
            <p className="toolbar__git-warning">{gitDiffError}</p>
          ) : null}

          {isMaintenanceMode ? (
            <div className="toolbar__advanced-top">
              {usagePages.length > 0 ? (
                <label className="toolbar__field">
                  <span>{t("pageLabel")}</span>
                  <select
                    aria-label={t("pageLabel")}
                    value={selectedPage}
                    onChange={(event) => onSelectedPageChange(event.target.value)}
                  >
                    <option value="all">{t("allPages")}</option>
                    {usagePages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.file}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="toolbar__field">
                <span>{t("gitBaseLabel")}</span>
                <input
                  aria-label={t("gitBaseLabel")}
                  value={gitBaseRef}
                  onChange={(event) => onGitBaseRefChange(event.target.value)}
                  placeholder="origin/main"
                />
              </label>
            </div>
          ) : null}

          <div className="toolbar__chips" role="group" aria-label={t("advancedQuery")}>
            <button
              type="button"
              className={groupByNamespace ? "filter-chip is-active" : "filter-chip"}
              aria-label={t("groupByNamespace")}
              aria-pressed={groupByNamespace}
              onClick={() => onGroupByNamespaceChange(!groupByNamespace)}
            >
              {t("groupByNamespace")}
            </button>
            {isMaintenanceMode ? (
              <button
                type="button"
                className={showExplorers ? "filter-chip is-active" : "filter-chip"}
                aria-label={t("explorersToggle")}
                aria-pressed={showExplorers}
                onClick={() => onShowExplorersChange(!showExplorers)}
              >
                {t("explorersToggle")}
              </button>
            ) : null}
            {isMaintenanceMode && selectedPageLabel ? (
              <button
                type="button"
                className="filter-chip is-active"
                onClick={() => onSelectedPageChange("all")}
              >
                {`${t("pageLabel")}: ${selectedPageLabel}`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
