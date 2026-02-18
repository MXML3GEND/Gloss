import { useState } from "react";
import type { CSSProperties } from "react";
import type { NamespaceTreeNode, TranslateFn } from "../types/translations";

type NamespaceTreeProps = {
  t: TranslateFn;
  tree: NamespaceTreeNode[];
  selectedNamespace: string;
  onSelectNamespace: (namespaceId: string) => void;
};

export default function NamespaceTree({
  t,
  tree,
  selectedNamespace,
  onSelectNamespace,
}: NamespaceTreeProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const renderNode = (node: NamespaceTreeNode, depth: number) => {
    const isExpanded = !collapsedNodes.has(node.id);
    const indentation = { paddingInlineStart: `${depth}rem` } as CSSProperties;

    return (
      <li key={node.id} className="namespace-tree__item" style={indentation}>
        <div className="namespace-tree__row">
          <button
            type="button"
            className="namespace-tree__toggle"
            onClick={() => toggleNode(node.id)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
          <button
            type="button"
            className={
              selectedNamespace === node.id
                ? "namespace-tree__node is-selected"
                : "namespace-tree__node"
            }
            onClick={() => onSelectNamespace(node.id)}
          >
            <span className="namespace-tree__name">{node.label}</span>
          </button>
        </div>

        {isExpanded && node.children.length > 0 ? (
          <ul className="namespace-tree__list">
            {node.children.map((child) => renderNode(child, depth + 0.85))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <aside className="namespace-tree" aria-label={t("namespaceTitle")}>
      <p className="namespace-tree__title">{t("namespaceTitle")}</p>
      <button
        type="button"
        className={
          selectedNamespace === "all"
            ? "namespace-tree__all-btn is-selected"
            : "namespace-tree__all-btn"
        }
        onClick={() => onSelectNamespace("all")}
      >
        {t("allNamespaces")}
      </button>

      {tree.length === 0 ? (
        <p className="namespace-tree__empty">{t("noNamespaces")}</p>
      ) : (
        <ul className="namespace-tree__list">
          {tree.map((node) => renderNode(node, 0.25))}
        </ul>
      )}
    </aside>
  );
}
