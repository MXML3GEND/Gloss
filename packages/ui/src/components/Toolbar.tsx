import { useMemo, useState } from "react";
import type {
  KeyUsagePage,
  TableFilterRule,
  TableSortConfig,
  TranslateFn,
} from "../types/translations";

type ToolbarProps = {
  t: TranslateFn;
  filterValue: string;
  onFilterChange: (value: string) => void;
  gitBaseRef: string;
  onGitBaseRefChange: (value: string) => void;
  gitDiffAvailable: boolean;
  gitDiffError: string | null;
  showOnlyGitChanged: boolean;
  onShowOnlyGitChangedChange: (value: boolean) => void;
  usagePages: KeyUsagePage[];
  selectedPage: string;
  onSelectedPageChange: (value: string) => void;
  showOnlyMissing: boolean;
  onShowOnlyMissingChange: (value: boolean) => void;
  locales: string[];
  filterRules: TableFilterRule[];
  sortConfig: TableSortConfig | null;
  onAddFilterRule: () => void;
  onUpdateFilterRule: (
    ruleId: string,
    patch: Partial<Omit<TableFilterRule, "id">>,
  ) => void;
  onRemoveFilterRule: (ruleId: string) => void;
  onClearFilterRules: () => void;
  onUpdateSortConfig: (patch: Partial<TableSortConfig>) => void;
  onClearSort: () => void;
};

const getColumnKind = (column: string): "text" | "number" | "status" => {
  if (column === "usage") {
    return "number";
  }
  if (column === "status") {
    return "status";
  }
  return "text";
};

const defaultOperatorForColumn = (column: string) => {
  const kind = getColumnKind(column);
  if (kind === "number") {
    return "eq";
  }
  if (kind === "status") {
    return "is";
  }
  return "contains";
};

export default function Toolbar({
  t,
  filterValue,
  onFilterChange,
  gitBaseRef,
  onGitBaseRefChange,
  gitDiffAvailable,
  gitDiffError,
  showOnlyGitChanged,
  onShowOnlyGitChangedChange,
  usagePages,
  selectedPage,
  onSelectedPageChange,
  showOnlyMissing,
  onShowOnlyMissingChange,
  locales,
  filterRules,
  sortConfig,
  onAddFilterRule,
  onUpdateFilterRule,
  onRemoveFilterRule,
  onClearFilterRules,
  onUpdateSortConfig,
  onClearSort,
}: ToolbarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const columnOptions = useMemo(() => {
    return [
      { value: "key", label: t("columnKey") },
      { value: "usage", label: t("columnUsage") },
      { value: "status", label: t("columnStatus") },
      ...locales.map((locale) => ({
        value: `locale:${locale}`,
        label: locale.toUpperCase(),
      })),
    ];
  }, [locales, t]);

  const statusOptions = useMemo(
    () => [
      { value: "missing", label: t("statusMissing") },
      { value: "untranslated", label: t("statusUntranslated") },
      { value: "partial", label: t("statusPartial") },
      { value: "complete", label: t("statusComplete") },
      { value: "unused", label: t("statusUnused") },
      { value: "used", label: t("statusUsed") },
    ],
    [t],
  );

  const operatorsByKind = useMemo(
    () => ({
      text: [
        { value: "contains", label: t("operatorContains") },
        { value: "not_contains", label: t("operatorNotContains") },
        { value: "equals", label: t("operatorEquals") },
        { value: "not_equals", label: t("operatorNotEquals") },
        { value: "starts_with", label: t("operatorStartsWith") },
        { value: "ends_with", label: t("operatorEndsWith") },
        { value: "is_empty", label: t("operatorIsEmpty") },
        { value: "is_not_empty", label: t("operatorIsNotEmpty") },
      ],
      number: [
        { value: "eq", label: t("operatorEquals") },
        { value: "neq", label: t("operatorNotEquals") },
        { value: "gt", label: t("operatorGt") },
        { value: "gte", label: t("operatorGte") },
        { value: "lt", label: t("operatorLt") },
        { value: "lte", label: t("operatorLte") },
      ],
      status: [
        { value: "is", label: t("operatorIs") },
        { value: "is_not", label: t("operatorIsNot") },
      ],
    }),
    [t],
  );

  return (
    <div className="toolbar">
      <div className="toolbar__primary">
        <label className="toolbar__field toolbar__field--search">
          <span>{t("filterKeys")}</span>
          <input
            aria-label={t("filterKeys")}
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="auth.login.title"
          />
        </label>
      </div>

      <div className="toolbar__secondary">
        {usagePages.length > 0 && (
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
        )}
        <label className="toolbar__toggle">
          <input
            aria-label={t("showOnlyMissing")}
            type="checkbox"
            checked={showOnlyMissing}
            onChange={(event) => onShowOnlyMissingChange(event.target.checked)}
          />
          <span>{t("showOnlyMissing")}</span>
        </label>
        <label className="toolbar__toggle">
          <input
            aria-label={t("showOnlyGitChanged")}
            type="checkbox"
            checked={showOnlyGitChanged}
            onChange={(event) => onShowOnlyGitChangedChange(event.target.checked)}
          />
          <span>{t("showOnlyGitChanged")}</span>
        </label>
        <label className="toolbar__field">
          <span>{t("gitBaseLabel")}</span>
          <input
            aria-label={t("gitBaseLabel")}
            value={gitBaseRef}
            onChange={(event) => onGitBaseRefChange(event.target.value)}
            placeholder="origin/main"
          />
        </label>
        <button
          type="button"
          className={showAdvanced ? "btn btn--ghost btn--small is-active" : "btn btn--ghost btn--small"}
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {t("advancedQuery")}
        </button>
      </div>

      {!gitDiffAvailable && gitDiffError ? (
        <p className="toolbar__git-warning">{gitDiffError}</p>
      ) : null}

      {showAdvanced ? (
        <div className="toolbar__advanced">
          <div className="toolbar__advanced-head">
            <strong>{t("advancedQuery")}</strong>
            <div className="toolbar__advanced-actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={onAddFilterRule}
              >
                {t("addFilter")}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={onClearFilterRules}
                disabled={filterRules.length === 0}
              >
                {t("clearFilters")}
              </button>
            </div>
          </div>

          {filterRules.length === 0 ? (
            <p className="toolbar__advanced-empty">{t("noFilters")}</p>
          ) : (
            <div className="toolbar__rules">
              {filterRules.map((rule) => {
                const kind = getColumnKind(rule.column);
                const operatorOptions = operatorsByKind[kind];
                const hidesValue =
                  rule.operator === "is_empty" || rule.operator === "is_not_empty";

                return (
                  <div key={rule.id} className="toolbar__rule">
                    <label className="toolbar__field">
                      <span>{t("filterColumn")}</span>
                      <select
                        value={rule.column}
                        onChange={(event) => {
                          const column = event.target.value;
                          const operator = defaultOperatorForColumn(column);
                          const nextValue =
                            getColumnKind(column) === "status" ? "missing" : "";

                          onUpdateFilterRule(rule.id, {
                            column,
                            operator,
                            value: nextValue,
                          });
                        }}
                      >
                        {columnOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="toolbar__field">
                      <span>{t("filterOperator")}</span>
                      <select
                        value={rule.operator}
                        onChange={(event) =>
                          onUpdateFilterRule(rule.id, { operator: event.target.value })
                        }
                      >
                        {operatorOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {kind === "status" ? (
                      <label className="toolbar__field">
                        <span>{t("filterValue")}</span>
                        <select
                          value={rule.value}
                          onChange={(event) =>
                            onUpdateFilterRule(rule.id, { value: event.target.value })
                          }
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="toolbar__field">
                        <span>{t("filterValue")}</span>
                        <input
                          value={rule.value}
                          disabled={hidesValue}
                          onChange={(event) =>
                            onUpdateFilterRule(rule.id, { value: event.target.value })
                          }
                        />
                      </label>
                    )}

                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      onClick={() => onRemoveFilterRule(rule.id)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="toolbar__sort">
            <label className="toolbar__field">
              <span>{t("sortBy")}</span>
              <select
                value={sortConfig?.column ?? "key"}
                onChange={(event) => onUpdateSortConfig({ column: event.target.value })}
              >
                {columnOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="toolbar__field">
              <span>{t("sortDirection")}</span>
              <select
                value={sortConfig?.direction ?? "asc"}
                onChange={(event) =>
                  onUpdateSortConfig({
                    direction: event.target.value as TableSortConfig["direction"],
                  })
                }
              >
                <option value="asc">{t("sortAsc")}</option>
                <option value="desc">{t("sortDesc")}</option>
              </select>
            </label>

            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={onClearSort}
              disabled={!sortConfig}
            >
              {t("clearSort")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
