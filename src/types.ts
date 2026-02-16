export type GlossConfig = {
  locales: string[];
  defaultLocale: string;
  path: string;
  format?: "json";
};

export type TranslationTree = Record<string, any>;

export type TranslationsByLocale = Record<string, TranslationTree>;
