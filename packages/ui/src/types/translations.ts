import type { UiMessageKey } from "../i18n";

export type TranslationTree = Record<string, unknown>;
export type FlatTranslations = Record<string, string>;
export type FlatTranslationsByLocale = Record<string, FlatTranslations>;

export type UsageMap = Record<
  string,
  {
    count: number;
    files: string[];
  }
>;

export type KeyUsagePage = {
  id: string;
  file: string;
  keys: string[];
};

export type KeyUsageFile = {
  id: string;
  file: string;
  keys: string[];
};

export type GitKeyLocaleChange = {
  locale: string;
  kind: "added" | "removed" | "changed";
  before: string;
  after: string;
};

export type GitKeyDiff = {
  key: string;
  changes: GitKeyLocaleChange[];
};

export type HardcodedTextIssue = {
  file: string;
  line: number;
  kind: "jsx_text" | "jsx_attribute";
  text: string;
};

export type IssueBaselineDelta = {
  missingTranslations: number;
  orphanKeys: number;
  invalidKeys: number;
  placeholderMismatches: number;
  hardcodedTexts: number;
  errorIssues: number;
  warningIssues: number;
  totalIssues: number;
};

export type IssueBaselineReport = {
  hasPrevious: boolean;
  baselinePath: string;
  previousUpdatedAt: string | null;
  currentUpdatedAt: string;
  delta: IssueBaselineDelta;
};

export type NamespaceSummary = {
  id: string;
  label: string;
  count: number;
  collapsed: boolean;
};

export type NamespaceTableGroup = {
  id: string;
  label: string;
  keys: string[];
};

export type NamespaceTreeNode = {
  id: string;
  label: string;
  keyCount: number;
  missingCount: number;
  unusedCount: number;
  children: NamespaceTreeNode[];
};

export type WorkspaceMode = "translate" | "maintenance";

export type DuplicateValueGroup = {
  id: string;
  value: string;
  keys: string[];
  count: number;
};

export type IssuesInboxType =
  | "missing"
  | "unused"
  | "placeholder_mismatch"
  | "invalid_key"
  | "hardcoded_text";

export type IssuesInboxItem = {
  id: string;
  type: IssuesInboxType;
  key?: string;
  file?: string;
  line?: number;
  text?: string;
  invalidReason?: "boundary_dot" | "consecutive_dots" | "empty_segment";
  missingLocales?: string[];
};

export type TableFilterRule = {
  id: string;
  column: string;
  operator: string;
  value: string;
};

export type TableSortDirection = "asc" | "desc";

export type TableSortConfig = {
  column: string;
  direction: TableSortDirection;
};

export type TranslateFn = (
  key: UiMessageKey,
  variables?: Record<string, string | number>,
) => string;

export const isMissingValue = (value: string | undefined) => value?.trim() === "";
