import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import RenameInlineForm from "./RenameInlineForm";
import type {
  FlatTranslationsByLocale,
  GitKeyDiff,
  NamespaceTableGroup,
  WorkspaceMode,
  TranslateFn,
  UsageMap,
} from "../types/translations";
import { isMissingValue } from "../types/translations";

type TranslationTableModel = {
  workspaceMode: WorkspaceMode;
  groupByNamespace: boolean;
  locales: string[];
  visibleKeys: string[];
  namespaceGroups: NamespaceTableGroup[];
  collapsedNamespaceGroupSet: Set<string>;
  data: FlatTranslationsByLocale;
  usage: UsageMap;
  changedSinceBaseKeySet: Set<string>;
  gitDiffByKey: Record<string, GitKeyDiff>;
  selectedFileKeySet: Set<string> | null;
  expandedKey: string | null;
  highlightedKey: string | null;
  renamingKey: string | null;
  renameValue: string;
  renameError: string | null;
  placeholderMismatchByKey: Set<string>;
  activeCell: { row: number; col: number } | null;
};

type TranslationTableActions = {
  isCellDirty: (locale: string, key: string) => boolean;
  textareaRows: (value: string) => number;
  onOpenUsageDetails: (key: string) => void;
  onToggleNamespaceGroup: (groupId: string) => void;
  onCellFocus: (row: number, col: number) => void;
  onCellBlur: () => void;
  onCellKeyDown: (
    event: KeyboardEvent<HTMLTextAreaElement>,
    row: number,
    col: number,
  ) => void;
  onCellChange: (locale: string, key: string, value: string) => void;
  onStartRename: (key: string) => void;
  onDeleteKey: (key: string) => void;
  onRenameValueChange: (value: string) => void;
  onApplyRename: (key: string) => void;
  onCancelRename: () => void;
  registerCellRef: (
    key: string,
    locale: string,
    element: HTMLTextAreaElement | null,
  ) => void;
};

type TranslationTableProps = {
  t: TranslateFn;
  model: TranslationTableModel;
  actions: TranslationTableActions;
};

export default function TranslationTable({
  t,
  model,
  actions,
}: TranslationTableProps) {
  const autoResizeTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };

  const {
    workspaceMode,
    groupByNamespace,
    locales,
    visibleKeys,
    namespaceGroups,
    collapsedNamespaceGroupSet,
    data,
    usage,
    changedSinceBaseKeySet,
    gitDiffByKey,
    selectedFileKeySet,
    expandedKey,
    highlightedKey,
    renamingKey,
    renameValue,
    renameError,
    placeholderMismatchByKey,
    activeCell,
  } = model;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  const virtualizationEnabled = !groupByNamespace && visibleKeys.length > 1000;
  const isMaintenanceMode = workspaceMode === "maintenance";
  const rowEstimate = 96;
  const overscan = 16;
  const totalColumns = locales.length + (isMaintenanceMode ? 4 : 1);
  const visibleKeySet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const keyRowIndexByKey = useMemo(() => {
    const next = new Map<string, number>();
    visibleKeys.forEach((key, index) => {
      next.set(key, index);
    });
    return next;
  }, [visibleKeys]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateViewportHeight = () => setViewportHeight(container.clientHeight);
    updateViewportHeight();

    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, []);

  useEffect(() => {
    if (!virtualizationEnabled || !activeCell || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const rowTop = activeCell.row * rowEstimate;
    const rowBottom = rowTop + rowEstimate;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + viewportHeight;

    if (rowTop < viewTop) {
      container.scrollTop = Math.max(0, rowTop - rowEstimate);
    } else if (rowBottom > viewBottom) {
      container.scrollTop = rowBottom - viewportHeight + rowEstimate;
    }
  }, [activeCell, rowEstimate, viewportHeight, virtualizationEnabled]);

  useEffect(() => {
    if (!highlightedKey || !containerRef.current) {
      return;
    }

    const escapedKey = highlightedKey.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const row = containerRef.current.querySelector(
      `tr[data-key="${escapedKey}"]`,
    ) as HTMLTableRowElement | null;
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlightedKey, visibleKeys]);

  const { startIndex, topSpacerHeight, bottomSpacerHeight, renderedKeys } = useMemo(() => {
      if (!virtualizationEnabled) {
        return {
          startIndex: 0,
          topSpacerHeight: 0,
          bottomSpacerHeight: 0,
          renderedKeys: visibleKeys,
        };
      }

      const start = Math.max(0, Math.floor(scrollTop / rowEstimate) - overscan);
      const end = Math.min(
        visibleKeys.length,
        Math.ceil((scrollTop + viewportHeight) / rowEstimate) + overscan,
      );

      return {
        startIndex: start,
        topSpacerHeight: start * rowEstimate,
        bottomSpacerHeight: Math.max(0, (visibleKeys.length - end) * rowEstimate),
        renderedKeys: visibleKeys.slice(start, end),
      };
    }, [
      overscan,
      rowEstimate,
      scrollTop,
      viewportHeight,
      virtualizationEnabled,
      visibleKeys,
    ]);

  const renderRow = (key: string, rowIndex: number) => {
    const translatedCount = locales.reduce((count, locale) => {
      return count + (isMissingValue(data[locale]?.[key] ?? "") ? 0 : 1);
    }, 0);
    const rowMissingClass =
      translatedCount === 0 ?
        "row-state--none"
      : translatedCount < locales.length ?
        "row-state--partial"
      : "";
    const rowDirty = locales.some((locale) => actions.isCellDirty(locale, key));
    const usageEntry = usage[key];
    const usageCount = usageEntry?.count ?? 0;
    const isUnused = usageCount === 0;
    const gitDiff = gitDiffByKey[key];
    const hasGitDiff = Boolean(gitDiff);
    const hasChangedSinceBase = changedSinceBaseKeySet.has(key);
    const isExpanded = expandedKey === key;
    const isFromSelectedFile = selectedFileKeySet?.has(key) ?? false;
    const hasPlaceholderMismatch = placeholderMismatchByKey.has(key);
    const isHighlighted = highlightedKey === key;
    const rowClassName = [
      rowMissingClass,
      isHighlighted ? "row-state--highlighted" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const keyCellClass = [
      "key-col",
      isMaintenanceMode && isUnused ? "key-col--unused" : "",
      isMaintenanceMode && isFromSelectedFile ? "key-col--file-selected" : "",
      isMaintenanceMode && hasPlaceholderMismatch ? "key-col--placeholder-warning" : "",
      !isMaintenanceMode ? "key-col--translate" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <Fragment key={key}>
        <tr className={rowClassName} data-key={key}>
          <td className={keyCellClass}>
            <span className="key-col__label">{key}</span>
            {isMaintenanceMode && rowDirty ? (
              <span className="key-col__dirty-dot" aria-label={t("changedSuffix")}>
                •
              </span>
            ) : null}
          </td>
          {isMaintenanceMode ? (
            <td
              className={
                isUnused ? "usage-col usage-cell usage-cell--unused" : "usage-col usage-cell"
              }
            >
              {isUnused && !hasGitDiff ? (
                <span className="usage-tag">{t("usageUnused")}</span>
              ) : (
                <button
                  type="button"
                  className="usage-toggle"
                  onClick={() => actions.onOpenUsageDetails(key)}
                  aria-expanded={isExpanded}
                >
                  {usageCount > 0 ? usageCount : "Δ"}
                </button>
              )}
            </td>
          ) : null}
          {isMaintenanceMode ? (
            <td className="status-col">
              <div className="status-col__summary">
                <span>{t("translated", { count: translatedCount, total: locales.length })}</span>
                {rowDirty ? <span className="status-col__changed">{t("changedSuffix")}</span> : null}
              </div>
              <div className="status-col__tags">
                {hasChangedSinceBase ? (
                  <span className="status-inline-tag status-inline-tag--info">
                    {t("gitChangedTag")}
                  </span>
                ) : null}
                {hasPlaceholderMismatch ? (
                  <span className="status-inline-tag status-inline-tag--warning">
                    {t("placeholderMismatchTag")}
                  </span>
                ) : null}
              </div>
            </td>
          ) : null}
          {locales.map((locale, colIndex) => {
            const value = data[locale]?.[key] ?? "";
            const missing = isMissingValue(value);
            const dirty = actions.isCellDirty(locale, key);
            const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
            const cellClass = dirty
              ? missing
                ? "value-cell value-cell--dirty-missing"
                : "value-cell value-cell--dirty"
              : missing
                ? "value-cell value-cell--missing"
                : "value-cell";
            const resolvedCellClass = isActive ? `${cellClass} value-cell--active` : cellClass;

            return (
              <td key={`${locale}-${key}`} className={`locale-cell ${resolvedCellClass}`}>
                <textarea
                  aria-label={`${locale}:${key}`}
                  ref={(element) => {
                    actions.registerCellRef(key, locale, element);
                    if (element) {
                      autoResizeTextarea(element);
                    }
                  }}
                  rows={actions.textareaRows(value)}
                  className={dirty ? "value-input value-input--dirty" : "value-input"}
                  value={value}
                  onInput={(event) => autoResizeTextarea(event.currentTarget)}
                  onFocus={() => actions.onCellFocus(rowIndex, colIndex)}
                  onBlur={actions.onCellBlur}
                  onKeyDown={(event) => actions.onCellKeyDown(event, rowIndex, colIndex)}
                  onChange={(event) => actions.onCellChange(locale, key, event.target.value)}
                />
              </td>
            );
          })}
          {isMaintenanceMode ? (
            <td className="actions-col">
              {renamingKey === key ? (
                <RenameInlineForm
                  t={t}
                  keyName={key}
                  value={renameValue}
                  error={renameError}
                  onChange={actions.onRenameValueChange}
                  onApply={() => actions.onApplyRename(key)}
                  onCancel={actions.onCancelRename}
                />
              ) : (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small row-action-icon-btn"
                    onClick={() => actions.onStartRename(key)}
                    aria-label={t("rename")}
                    title={t("rename")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path
                        d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.88-8.88.92.92-8.88 8.88zM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.67 1.67 3.75 3.75 1.67-1.68z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--small row-action-icon-btn"
                    onClick={() => actions.onDeleteKey(key)}
                    aria-label={t("delete")}
                    title={t("delete")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path
                        d="M6 7h12v2H6V7zm2 3h8l-1 9H9L8 10zm3-6h2l1 1h4v2H6V5h4l1-1z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </td>
          ) : null}
        </tr>
      </Fragment>
    );
  };

  const renderNamespaceGroupRows = () => {
    return namespaceGroups.map((group) => {
      const isCollapsed = collapsedNamespaceGroupSet.has(group.id);
      const visibleGroupKeys = isCollapsed
        ? []
        : group.keys.filter((key) => visibleKeySet.has(key));

      return (
        <Fragment key={`group:${group.id}`}>
          <tr className="namespace-group-row">
            <td colSpan={totalColumns}>
              <button
                type="button"
                className="namespace-group-toggle"
                onClick={() => actions.onToggleNamespaceGroup(group.id)}
                aria-expanded={!isCollapsed}
              >
                <span className="namespace-group-toggle__caret">
                  {isCollapsed ? "▸" : "▾"}
                </span>
                <span className="namespace-group-toggle__label">{group.label}</span>
                <span className="namespace-group-toggle__count">
                  {t("namespaceGroupCount", { count: group.keys.length })}
                </span>
              </button>
            </td>
          </tr>
          {visibleGroupKeys.map((key) =>
            renderRow(key, keyRowIndexByKey.get(key) ?? 0),
          )}
        </Fragment>
      );
    });
  };

  return (
    <div
      ref={containerRef}
      className="table-wrap"
      onScroll={(event) =>
        virtualizationEnabled
          ? setScrollTop((event.target as HTMLDivElement).scrollTop)
          : undefined
      }
    >
      <table
        className={[
          "grid-table",
          virtualizationEnabled ? "grid-table--virtualized" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <thead>
          <tr>
            <th className="key-col">{t("keyColumn")}</th>
            {isMaintenanceMode ? <th className="usage-col">{t("usageColumn")}</th> : null}
            {isMaintenanceMode ? <th className="status-col">{t("statusColumn")}</th> : null}
            {locales.map((locale) => (
              <th key={locale} className="locale-col">
                {locale}
              </th>
            ))}
            {isMaintenanceMode ? <th className="actions-col">{t("actionsColumn")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {virtualizationEnabled && topSpacerHeight > 0 ? (
            <tr className="virtual-spacer">
              <td colSpan={totalColumns} style={{ height: `${topSpacerHeight}px` }} />
            </tr>
          ) : null}
          {groupByNamespace
            ? renderNamespaceGroupRows()
            : renderedKeys.map((key, renderedIndex) =>
                renderRow(
                  key,
                  keyRowIndexByKey.get(key) ?? (startIndex + renderedIndex),
                ),
              )}
          {virtualizationEnabled && bottomSpacerHeight > 0 ? (
            <tr className="virtual-spacer">
              <td colSpan={totalColumns} style={{ height: `${bottomSpacerHeight}px` }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
