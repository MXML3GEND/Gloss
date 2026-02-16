import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import RenameInlineForm from "./RenameInlineForm";
import type {
  FlatTranslationsByLocale,
  GitKeyDiff,
  TranslateFn,
  UsageMap,
} from "../types/translations";
import { isMissingValue } from "../types/translations";

type TranslationTableModel = {
  locales: string[];
  visibleKeys: string[];
  data: FlatTranslationsByLocale;
  usage: UsageMap;
  gitBaseRef: string;
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
  onToggleExpanded: (key: string) => void;
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
  const {
    locales,
    visibleKeys,
    data,
    usage,
    gitBaseRef,
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

  const virtualizationEnabled = visibleKeys.length > 1000;
  const rowEstimate = 96;
  const overscan = 16;
  const totalColumns = locales.length + 4;

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
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
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
    const usageFiles = usageEntry?.files ?? [];
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
      isUnused ? "key-col--unused" : "",
      isFromSelectedFile ? "key-col--file-selected" : "",
      hasPlaceholderMismatch ? "key-col--placeholder-warning" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <Fragment key={key}>
        <tr className={rowClassName} data-key={key}>
          <td className={keyCellClass}>
            {key}
            {rowDirty ? " *" : ""}
          </td>
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
                onClick={() => actions.onToggleExpanded(key)}
                aria-expanded={isExpanded}
              >
                {usageCount > 0 ? usageCount : "Δ"}
              </button>
            )}
          </td>
          <td className="status-col">
            <div>{t("translated", { count: translatedCount, total: locales.length })}</div>
            {rowDirty ? <div>{t("changedSuffix")}</div> : null}
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
                  }}
                  rows={actions.textareaRows(value)}
                  className={dirty ? "value-input value-input--dirty" : "value-input"}
                  value={value}
                  onFocus={() => actions.onCellFocus(rowIndex, colIndex)}
                  onBlur={actions.onCellBlur}
                  onKeyDown={(event) => actions.onCellKeyDown(event, rowIndex, colIndex)}
                  onChange={(event) => actions.onCellChange(locale, key, event.target.value)}
                />
              </td>
            );
          })}
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
                  className="btn btn--ghost btn--small"
                  onClick={() => actions.onStartRename(key)}
                >
                  {t("rename")}
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  onClick={() => actions.onDeleteKey(key)}
                >
                  {t("delete")}
                </button>
              </div>
            )}
          </td>
        </tr>
        {isExpanded && (
          <tr className="usage-files-row">
            <td colSpan={totalColumns}>
              <div className="usage-files">
                <strong>{t("usageFilesLabel")}</strong>
                {usageFiles.length === 0 ? (
                  <span>{t("noUsageFiles")}</span>
                ) : (
                  <ul className="usage-files-list">
                    {usageFiles.map((file) => (
                      <li key={`${key}-${file}`}>{file}</li>
                    ))}
                  </ul>
                )}
                {gitDiff ? (
                  <div className="key-diff-block">
                    <strong>{t("gitDiffLabel", { base: gitBaseRef })}</strong>
                    <ul className="usage-files-list">
                      {gitDiff.changes.map((change) => {
                        const kindLabel =
                          change.kind === "added"
                            ? t("gitDiffKindAdded")
                            : change.kind === "removed"
                              ? t("gitDiffKindRemoved")
                              : t("gitDiffKindChanged");

                        return (
                          <li key={`${key}-${change.locale}`}>
                            <span className="key-diff-line">
                              {change.locale} ({kindLabel}):{" "}
                              {JSON.stringify(change.before)} {" -> "}{" "}
                              {JSON.stringify(change.after)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
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
            <th>{t("usageColumn")}</th>
            <th>{t("statusColumn")}</th>
            {locales.map((locale) => (
              <th key={locale} className="locale-col">
                {locale}
              </th>
            ))}
            <th>{t("actionsColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {virtualizationEnabled && topSpacerHeight > 0 ? (
            <tr className="virtual-spacer">
              <td colSpan={totalColumns} style={{ height: `${topSpacerHeight}px` }} />
            </tr>
          ) : null}
          {renderedKeys.map((key, renderedIndex) =>
            renderRow(key, startIndex + renderedIndex),
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
