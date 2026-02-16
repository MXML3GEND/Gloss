import type { ScanConfig } from "@gloss/shared";

const normalizePath = (filePath: string) =>
  filePath.split("\\").join("/").replace(/^\.\//, "");

const escapeRegexChar = (value: string) =>
  value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

const globToRegExp = (pattern: string) => {
  const normalized = normalizePath(pattern.trim());
  let regex = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      regex += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegexChar(char);
  }

  regex += "$";
  return new RegExp(regex);
};

const compilePatterns = (patterns: string[] | undefined): RegExp[] => {
  if (!patterns || patterns.length === 0) {
    return [];
  }

  return patterns.map((pattern) => globToRegExp(pattern));
};

export const createScanMatcher = (scan?: ScanConfig) => {
  const includes = compilePatterns(scan?.include);
  const excludes = compilePatterns(scan?.exclude);

  return (relativePath: string) => {
    const normalized = normalizePath(relativePath);

    if (includes.length > 0 && !includes.some((pattern) => pattern.test(normalized))) {
      return false;
    }

    if (excludes.some((pattern) => pattern.test(normalized))) {
      return false;
    }

    return true;
  };
};
