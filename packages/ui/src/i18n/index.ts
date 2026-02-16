import en from "./en";
import nl from "./nl";

export type UiLanguage = "en" | "nl";
export type UiMessageKey = keyof typeof en;

const DICTIONARY = { en, nl } as const;

const interpolate = (
  template: string,
  variables?: Record<string, string | number>,
): string => {
  if (!variables) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    if (variables[key] === undefined) {
      return "";
    }

    return String(variables[key]);
  });
};

export const translate = (
  language: UiLanguage,
  key: UiMessageKey,
  variables?: Record<string, string | number>,
): string => {
  return interpolate(DICTIONARY[language][key], variables);
};
