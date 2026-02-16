import type { NamespaceSummary, TranslateFn } from "../types/translations";

type NamespaceBarProps = {
  t: TranslateFn;
  namespaces: NamespaceSummary[];
  onToggleNamespace: (namespaceId: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
};

export default function NamespaceBar({
  t,
  namespaces,
  onToggleNamespace,
  onCollapseAll,
  onExpandAll,
}: NamespaceBarProps) {
  if (namespaces.length === 0) {
    return null;
  }

  return (
    <div className="namespace-bar">
      <div className="namespace-bar__header">
        <p className="namespace-bar__title">{t("namespacesLabel")}</p>
        <div className="namespace-bar__actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={onExpandAll}>
            {t("expandAll")}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onCollapseAll}>
            {t("collapseAll")}
          </button>
        </div>
      </div>
      <div className="namespace-bar__list">
        {namespaces.map((namespace) => (
          <button
            key={namespace.id}
            type="button"
            className={
              namespace.collapsed
                ? "namespace-pill namespace-pill--collapsed"
                : "namespace-pill"
            }
            onClick={() => onToggleNamespace(namespace.id)}
          >
            <span>{namespace.label}</span>
            <small>{namespace.count}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
