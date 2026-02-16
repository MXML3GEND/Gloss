import type { DuplicateValueGroup, TranslateFn } from "../types/translations";

type DuplicateValuesPanelProps = {
  t: TranslateFn;
  groups: DuplicateValueGroup[];
  onUnify: (group: DuplicateValueGroup) => void;
};

export default function DuplicateValuesPanel({
  t,
  groups,
  onUnify,
}: DuplicateValuesPanelProps) {
  if (groups.length === 0) {
    return <p className="empty-state">{t("duplicateValuesEmpty")}</p>;
  }

  return (
    <div className="duplicates-panel">
      <p className="duplicates-panel__title">{t("duplicateValuesTitle")}</p>
      <p>dzqdzqdqzdqz</p>

      <div className="duplicates-panel__list">
        {groups.map((group) => (
          <article key={group.id} className="duplicate-group">
            <div className="duplicate-group__top">
              <strong className="duplicate-group__value">{group.value}</strong>
              <span className="duplicate-group__count">
                {t("duplicateValueCount", { count: group.count })}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => onUnify(group)}
              >
                {t("duplicateUnify")}
              </button>
            </div>
            <ul className="duplicate-group__keys">
              {group.keys.map((key) => (
                <li key={`${group.id}-${key}`}>{key}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
