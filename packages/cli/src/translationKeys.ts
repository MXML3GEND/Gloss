const TRANSLATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

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
