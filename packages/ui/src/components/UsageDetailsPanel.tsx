import type { GitKeyDiff, TranslateFn, UsageMap } from "../types/translations";

type UsageDetailsPanelProps = {
  t: TranslateFn;
  selectedKey: string | null;
  usageEntry: UsageMap[string] | null;
  gitDiff: GitKeyDiff | null;
  gitBaseRef: string;
};

export default function UsageDetailsPanel({
  t,
  selectedKey,
  usageEntry,
  gitDiff,
  gitBaseRef,
}: UsageDetailsPanelProps) {
  if (!selectedKey) {
    return <p className="empty-state empty-state--panel">{t("usageDetailsNoSelection")}</p>;
  }

  const usageCount = usageEntry?.count ?? 0;
  const files = usageEntry?.files ?? [];

  return (
    <section className="usage-details-panel" aria-label={t("tabUsageDetails")}>
      <dl className="usage-details-panel__meta">
        <div>
          <dt>{t("usageDetailsKeyLabel")}</dt>
          <dd>{selectedKey}</dd>
        </div>
        <div>
          <dt>{t("usageDetailsCountLabel")}</dt>
          <dd>{usageCount}</dd>
        </div>
      </dl>

      <div className="usage-details-panel__section">
        <p className="usage-details-panel__title">
          {t("usageDetailsFilesLabel", { count: files.length })}
        </p>
        {files.length === 0 ? (
          <p className="usage-details-panel__empty">{t("noUsageFiles")}</p>
        ) : (
          <ul className="usage-files-list">
            {files.map((file) => (
              <li key={`${selectedKey}-${file}`}>{file}</li>
            ))}
          </ul>
        )}
      </div>

      {gitDiff ? (
        <div className="usage-details-panel__section">
          <p className="usage-details-panel__title">{t("gitDiffLabel", { base: gitBaseRef })}</p>
          <ul className="usage-files-list">
            {gitDiff.changes.map((change) => {
              const kindLabel =
                change.kind === "added"
                  ? t("gitDiffKindAdded")
                  : change.kind === "removed"
                    ? t("gitDiffKindRemoved")
                    : t("gitDiffKindChanged");

              return (
                <li key={`${selectedKey}-${change.locale}`}>
                  <span className="key-diff-line">
                    {change.locale} ({kindLabel}): {JSON.stringify(change.before)} {" -> "}{" "}
                    {JSON.stringify(change.after)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
