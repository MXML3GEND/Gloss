export type ScanConfig = {
  include?: string[];
  exclude?: string[];
};

export type GlossConfig = {
  locales: string[];
  defaultLocale: string;
  path: string;
  format?: "json";
  scan?: ScanConfig;
};

export type TranslationTree = Record<string, any>;

export type TranslationsByLocale = Record<string, TranslationTree>;

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

export type KeyUsageResponse = {
  pages: KeyUsagePage[];
  files?: KeyUsageFile[];
  generatedAt: string;
};
