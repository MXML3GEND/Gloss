import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { KeyUsageFile, TranslateFn } from "../types/translations";

type MutableFolderNode = {
  id: string;
  name: string;
  folders: Map<string, MutableFolderNode>;
  files: KeyUsageFile[];
};

type FolderNode = {
  id: string;
  name: string;
  folders: FolderNode[];
  files: KeyUsageFile[];
};

type TreeData = {
  rootFolders: FolderNode[];
  rootFiles: KeyUsageFile[];
};

type FileUsageTreeProps = {
  t: TranslateFn;
  files: KeyUsageFile[];
  selectedFile: string;
  onSelectFile: (id: string) => void;
};

const buildTree = (files: KeyUsageFile[]): TreeData => {
  const root: MutableFolderNode = {
    id: "",
    name: "",
    folders: new Map<string, MutableFolderNode>(),
    files: [],
  };

  for (const fileUsage of files) {
    const segments = fileUsage.file.split("/").filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let current = root;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const folderId = current.id ? `${current.id}/${segment}` : segment;

      if (!current.folders.has(segment)) {
        current.folders.set(segment, {
          id: folderId,
          name: segment,
          folders: new Map<string, MutableFolderNode>(),
          files: [],
        });
      }

      current = current.folders.get(segment)!;
    }

    current.files.push(fileUsage);
  }

  const toFolderNode = (folder: MutableFolderNode): FolderNode => {
    const folders = Array.from(folder.folders.values())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((child) => toFolderNode(child));
    const sortedFiles = [...folder.files].sort((left, right) =>
      left.file.localeCompare(right.file),
    );

    return {
      id: folder.id,
      name: folder.name,
      folders,
      files: sortedFiles,
    };
  };

  return {
    rootFolders: Array.from(root.folders.values())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((folder) => toFolderNode(folder)),
    rootFiles: [...root.files].sort((left, right) => left.file.localeCompare(right.file)),
  };
};

export default function FileUsageTree({
  t,
  files,
  selectedFile,
  onSelectFile,
}: FileUsageTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const treeData = useMemo(() => buildTree(files), [files]);

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderFileNode = (fileUsage: KeyUsageFile, depth: number) => {
    const nameSegments = fileUsage.file.split("/");
    const fileName = nameSegments[nameSegments.length - 1] ?? fileUsage.file;
    const indentation = { paddingInlineStart: `${depth}rem` } as CSSProperties;

    return (
      <li key={fileUsage.id} className="file-tree__item" style={indentation}>
        <button
          type="button"
          className={
            selectedFile === fileUsage.id
              ? "file-tree__file-btn is-selected"
              : "file-tree__file-btn"
          }
          onClick={() => onSelectFile(fileUsage.id)}
        >
          <span className="file-tree__file-name">{fileName}</span>
          <small className="file-tree__file-count">{fileUsage.keys.length}</small>
        </button>
      </li>
    );
  };

  const renderFolderNode = (folder: FolderNode, depth: number) => {
    const isExpanded = !collapsedFolders.has(folder.id);

    return (
      <li
        key={folder.id}
        className="file-tree__item"
        style={{ paddingInlineStart: `${depth}rem` }}
      >
        <button
          type="button"
          className="file-tree__folder-btn"
          onClick={() => toggleFolder(folder.id)}
          aria-expanded={isExpanded}
        >
          <span className="file-tree__caret">{isExpanded ? "▾" : "▸"}</span>
          <span className="file-tree__folder-name">{folder.name}</span>
        </button>
        {isExpanded && (
          <ul className="file-tree__list">
            {folder.folders.map((childFolder) => renderFolderNode(childFolder, depth + 0.85))}
            {folder.files.map((fileUsage) => renderFileNode(fileUsage, depth + 0.85))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside className="file-tree" aria-label={t("filesTitle")}>
      <p className="file-tree__title">{t("filesTitle")}</p>
      <button
        type="button"
        className={
          selectedFile === "all"
            ? "file-tree__all-btn is-selected"
            : "file-tree__all-btn"
        }
        onClick={() => onSelectFile("all")}
      >
        {t("allFiles")}
      </button>

      {files.length === 0 ? (
        <p className="file-tree__empty">{t("noFilesFound")}</p>
      ) : (
        <ul className="file-tree__list">
          {treeData.rootFolders.map((folder) => renderFolderNode(folder, 0.25))}
          {treeData.rootFiles.map((fileUsage) => renderFileNode(fileUsage, 0.25))}
        </ul>
      )}
    </aside>
  );
}
