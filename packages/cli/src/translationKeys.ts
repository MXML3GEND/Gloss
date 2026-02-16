const TRANSLATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const KEY_CHAR_PATTERN = /^[A-Za-z0-9._:/-]+$/;

export const isLikelyTranslationKey = (value: string) => {
  const key = value.trim();

  if (key.length === 0 || key.length > 160) {
    return false;
  }

  if (/\s/.test(key)) {
    return false;
  }

  if (/[+;,{}()[\]\\]/.test(key)) {
    return false;
  }

  if (key.includes("://")) {
    return false;
  }

  return TRANSLATION_KEY_PATTERN.test(key);
};

export const getInvalidTranslationKeyReason = (value: string): string | null => {
  const key = value.trim();

  if (!key) {
    return "Key is empty.";
  }

  if (key.startsWith(".") || key.endsWith(".")) {
    return "Key cannot start or end with a dot.";
  }

  if (key.includes("..")) {
    return "Key cannot contain consecutive dots.";
  }

  if (key.split(".").some((segment) => segment.trim() === "")) {
    return "Key contains an empty segment.";
  }

  if (!KEY_CHAR_PATTERN.test(key)) {
    return "Key contains unsupported characters.";
  }

  return null;
};
