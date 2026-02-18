import { useMemo } from "react";
import type { IssuesInboxItem, TranslateFn } from "../types/translations";

type IssuesInboxPanelProps = {
  t: TranslateFn;
  items: IssuesInboxItem[];
  onOpenKey: (key: string) => void;
  onFillMissing: (key: string) => void;
  onNormalizePlaceholders: (key: string) => void;
  onDeleteUnused: (key: string) => void;
  onDeprecateUnused: (key: string) => void;
  onFillAllMissing: () => void;
  onNormalizeAllPlaceholders: () => void;
  onDeprecateAllUnused: () => void;
};

const ISSUE_TYPE_ORDER: Record<IssuesInboxItem["type"], number> = {
  missing: 1,
  placeholder_mismatch: 2,
  invalid_key: 3,
  unused: 4,
  hardcoded_text: 5,
};

const ISSUE_TYPE_LABEL: Record<IssuesInboxItem["type"], Parameters<TranslateFn>[0]> = {
  missing: "issuesTypeMissing",
  placeholder_mismatch: "issuesTypePlaceholder",
  invalid_key: "issuesTypeInvalid",
  unused: "issuesTypeUnused",
  hardcoded_text: "issuesTypeHardcoded",
};

export default function IssuesInboxPanel({
  t,
  items,
  onOpenKey,
  onFillMissing,
  onNormalizePlaceholders,
  onDeleteUnused,
  onDeprecateUnused,
  onFillAllMissing,
  onNormalizeAllPlaceholders,
  onDeprecateAllUnused,
}: IssuesInboxPanelProps) {
  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftRank = ISSUE_TYPE_ORDER[left.type];
      const rightRank = ISSUE_TYPE_ORDER[right.type];
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftRef = left.key ?? `${left.file}:${left.line ?? 0}`;
      const rightRef = right.key ?? `${right.file}:${right.line ?? 0}`;
      return leftRef.localeCompare(rightRef);
    });
  }, [items]);

  const issueTypeCounts = useMemo(() => {
    return sortedItems.reduce(
      (counts, issue) => {
        counts[issue.type] += 1;
        return counts;
      },
      {
        missing: 0,
        placeholder_mismatch: 0,
        invalid_key: 0,
        unused: 0,
        hardcoded_text: 0,
      } satisfies Record<IssuesInboxItem["type"], number>,
    );
  }, [sortedItems]);

  if (sortedItems.length === 0) {
    return <p className="empty-state empty-state--panel">{t("issuesInboxEmpty")}</p>;
  }

  const formatIssueMeta = (issue: IssuesInboxItem) => {
    if (issue.type === "missing") {
      const count = issue.missingLocales?.length ?? 0;
      return t("issuesMetaMissing", { count });
    }
    if (issue.type === "placeholder_mismatch") {
      return t("issuesMetaPlaceholder");
    }
    if (issue.type === "unused") {
      return t("issuesMetaUnused");
    }
    if (issue.type === "invalid_key") {
      if (issue.invalidReason === "boundary_dot") {
        return t("keyBoundaryDot");
      }
      if (issue.invalidReason === "consecutive_dots") {
        return t("keyConsecutiveDots");
      }
      if (issue.invalidReason === "empty_segment") {
        return t("keyEmptySegment");
      }
      return t("issuesMetaInvalid");
    }
    const location =
      issue.file ?
        `${issue.file}:${issue.line ?? 0}`
      : t("hardcodedTextNoLocations");
    const snippet = issue.text?.trim() ?? "";
    if (!snippet) {
      return location;
    }
    return `${location} - ${snippet}`;
  };

  return (
    <section className="issues-panel" aria-label={t("tabIssuesInbox")}>
      <header className="issues-panel__header">
        <h2 className="issues-panel__title">{t("issuesInboxTitle")}</h2>
        <span className="issues-panel__count">
          {t("issuesInboxCount", { count: sortedItems.length })}
        </span>
      </header>
      <div className="issues-panel__actions">
        {issueTypeCounts.missing > 0 ? (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onFillAllMissing}
          >
            {t("issuesActionFillAllMissing")}
          </button>
        ) : null}
        {issueTypeCounts.placeholder_mismatch > 0 ? (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onNormalizeAllPlaceholders}
          >
            {t("issuesActionNormalizeAllPlaceholders")}
          </button>
        ) : null}
        {issueTypeCounts.unused > 0 ? (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onDeprecateAllUnused}
          >
            {t("issuesActionDeprecateAllUnused")}
          </button>
        ) : null}
      </div>

      <ul className="issues-panel__list">
        {sortedItems.map((issue) => {
          const typeLabel = t(ISSUE_TYPE_LABEL[issue.type]);
          const meta = formatIssueMeta(issue);
          const key = issue.key;

          return (
            <li key={issue.id} className={`issue-row issue-row--${issue.type}`}>
              <span className="issue-row__badge">{typeLabel}</span>
              {key ? (
                <button
                  type="button"
                  className="issue-row__key"
                  onClick={() => onOpenKey(key)}
                >
                  {key}
                </button>
              ) : (
                <span className="issue-row__key issue-row__key--passive">
                  {t("issuesTypeHardcoded")}
                </span>
              )}
              <span className="issue-row__meta">{meta}</span>
              <div className="issue-row__actions">
                {issue.type === "missing" && key ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => onFillMissing(key)}
                  >
                    {t("issuesActionFillMissing")}
                  </button>
                ) : null}
                {issue.type === "placeholder_mismatch" && key ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => onNormalizePlaceholders(key)}
                  >
                    {t("issuesActionNormalizePlaceholders")}
                  </button>
                ) : null}
                {issue.type === "unused" && key ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => onDeprecateUnused(key)}
                    >
                      {t("issuesActionDeprecate")}
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      onClick={() => onDeleteUnused(key)}
                    >
                      {t("issuesActionDelete")}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
