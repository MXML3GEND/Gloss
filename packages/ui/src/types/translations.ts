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

export type NamespaceSummary = {
  id: string;
  label: string;
  count: number;
  collapsed: boolean;
};

export type DuplicateValueGroup = {
  id: string;
  value: string;
  keys: string[];
  count: number;
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
