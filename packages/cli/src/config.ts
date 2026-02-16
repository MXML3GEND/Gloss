import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { GlossConfig } from "@gloss/shared";

export type GlossConfigErrorCode =
  | "MISSING_CONFIG"
  | "INVALID_CONFIG"
  | "NO_LOCALES";

export class GlossConfigError extends Error {
  readonly code: GlossConfigErrorCode;

  constructor(code: GlossConfigErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "GlossConfigError";
  }
}

const normalizeScanPatterns = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const next = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return next.length > 0 ? next : undefined;
};

const normalizeScanConfig = (value: unknown): GlossConfig["scan"] => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const scan = value as { include?: unknown; exclude?: unknown; mode?: unknown };
  const include = normalizeScanPatterns(scan.include);
  const exclude = normalizeScanPatterns(scan.exclude);
  const mode =
    scan.mode === "regex" || scan.mode === "ast" ? scan.mode : undefined;

  if (!include && !exclude && !mode) {
    return undefined;
  }

  return { include, exclude, mode };
};

const CONFIG_FILE_NAMES = [
  "gloss.config.ts",
  "gloss.config.mts",
  "gloss.config.js",
  "gloss.config.mjs",
  "gloss.config.cjs",
];

const LOCALE_CODE_PATTERN = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;

const AUTO_DISCOVERY_IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "out",
]);

const DIRECTORY_NAME_SCORES = new Map<string, number>([
  ["i18n", 80],
  ["locales", 80],
  ["locale", 60],
  ["translations", 55],
  ["translation", 45],
  ["lang", 35],
  ["langs", 35],
  ["messages", 25],
]);

type LocaleDirectoryCandidate = {
  directoryPath: string;
  locales: string[];
  depth: number;
};

const normalizePath = (filePath: string) =>
  filePath.split(path.sep).join("/").replace(/^\.\//, "");

const isLikelyLocaleCode = (value: string) => LOCALE_CODE_PATTERN.test(value);

const scoreDirectoryName = (directoryPath: string) => {
  const segments = normalizePath(directoryPath).split("/");
  return segments.reduce((score, segment) => {
    const nextScore = DIRECTORY_NAME_SCORES.get(segment.toLowerCase());
    return score + (nextScore ?? 0);
  }, 0);
};

const resolveLocalesDirectory = (cwd: string, localesPath: string) => {
  if (path.isAbsolute(localesPath)) {
    return localesPath;
  }

  return path.join(cwd, localesPath);
};

const discoverLocales = async (cwd: string, localesPath: string) => {
  const directory = resolveLocalesDirectory(cwd, localesPath);

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const localeCandidates = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.basename(entry.name, ".json").trim())
      .filter((entry) => entry.length > 0);

    const likelyLocales = localeCandidates.filter(isLikelyLocaleCode);
    const localesToUse =
      likelyLocales.length > 0 ? likelyLocales : localeCandidates;

    return localesToUse
      .filter((entry) => entry.length > 0)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
};

const discoverLocaleDirectoryCandidates = async (
  cwd: string,
): Promise<LocaleDirectoryCandidate[]> => {
  const candidates: LocaleDirectoryCandidate[] = [];

  const visit = async (directory: string) => {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    const directoryLocales = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.basename(entry.name, ".json").trim())
      .filter((entry) => isLikelyLocaleCode(entry));

    if (directoryLocales.length > 0) {
      const normalizedDirectory = normalizePath(path.relative(cwd, directory));
      const uniqueLocales = Array.from(new Set(directoryLocales)).sort((a, b) =>
        a.localeCompare(b),
      );
      const depth =
        normalizedDirectory.length === 0
          ? 0
          : normalizedDirectory.split("/").length;

      candidates.push({
        directoryPath: directory,
        locales: uniqueLocales,
        depth,
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (
        entry.name.startsWith(".") ||
        AUTO_DISCOVERY_IGNORED_DIRECTORIES.has(entry.name)
      ) {
        continue;
      }

      await visit(path.join(directory, entry.name));
    }
  };

  await visit(cwd);
  return candidates;
};

const selectLocaleDirectoryCandidate = (
  candidates: LocaleDirectoryCandidate[],
  preferredLocales: string[],
) => {
  const scored = candidates.map((candidate) => {
    const localeMatches = preferredLocales.filter((locale) =>
      candidate.locales.includes(locale),
    );
    const allPreferredMatch =
      preferredLocales.length > 0 &&
      preferredLocales.every((locale) => candidate.locales.includes(locale));
    const directoryNameScore = scoreDirectoryName(candidate.directoryPath);
    const srcHintScore = normalizePath(candidate.directoryPath).includes("/src/")
      ? 15
      : 0;
    const depthScore = Math.max(0, 30 - candidate.depth * 3);
    const localeCountScore = candidate.locales.length * 10;
    const preferredScore = localeMatches.length * 25 + (allPreferredMatch ? 80 : 0);
    const score =
      directoryNameScore +
      srcHintScore +
      depthScore +
      localeCountScore +
      preferredScore;

    return { candidate, score };
  });

  scored.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    if (left.candidate.depth !== right.candidate.depth) {
      return left.candidate.depth - right.candidate.depth;
    }

    return left.candidate.directoryPath.localeCompare(right.candidate.directoryPath);
  });

  return scored[0]?.candidate;
};

const resolveDiscoveredPath = (cwd: string, directoryPath: string) => {
  const relative = path.relative(cwd, directoryPath);
  if (!relative || relative === ".") {
    return ".";
  }

  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return normalizePath(relative);
  }

  return directoryPath;
};

const resolveConfigPath = async (cwd: string) => {
  for (const fileName of CONFIG_FILE_NAMES) {
    const candidatePath = path.join(cwd, fileName);
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return null;
};

const normalizeLoadedConfig = (value: unknown): Partial<GlossConfig> | undefined => {
  if (value && typeof value === "object" && "default" in (value as object)) {
    return (value as { default?: Partial<GlossConfig> }).default;
  }

  return value as Partial<GlossConfig> | undefined;
};

export async function loadGlossConfig(): Promise<GlossConfig> {
  const cwd = process.env.INIT_CWD || process.cwd();
  const configPath = await resolveConfigPath(cwd);

  if (!configPath) {
    throw new GlossConfigError(
      "MISSING_CONFIG",
      `Missing config in ${cwd}. Expected one of: ${CONFIG_FILE_NAMES.join(", ")}.`,
    );
  }

  try {
    const extension = path.extname(configPath).toLowerCase();
    const loaded =
      extension === ".cjs"
        ? createRequire(import.meta.url)(configPath)
        : await import(pathToFileURL(configPath).href);
    const cfg = normalizeLoadedConfig(loaded);

    if (!cfg || typeof cfg !== "object") {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "Default export must be a config object.",
      );
    }

    if (
      cfg.path !== undefined &&
      (typeof cfg.path !== "string" || !cfg.path.trim())
    ) {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "`path` must be a non-empty string when provided.",
      );
    }

    if (cfg.locales !== undefined && !Array.isArray(cfg.locales)) {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "`locales` must be an array of locale codes when provided.",
      );
    }

    const configuredLocales = Array.isArray(cfg.locales)
      ? cfg.locales
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
      : [];

    const configuredPath = typeof cfg.path === "string" ? cfg.path.trim() : "";
    const discoveredDirectoryCandidate = configuredPath
      ? null
      : selectLocaleDirectoryCandidate(
          await discoverLocaleDirectoryCandidates(cwd),
          configuredLocales,
        );
    const translationsPath = configuredPath
      ? configuredPath
      : discoveredDirectoryCandidate
        ? resolveDiscoveredPath(cwd, discoveredDirectoryCandidate.directoryPath)
        : "";

    if (!translationsPath) {
      throw new GlossConfigError(
        "NO_LOCALES",
        "No locale directory found. Set `path` in config or add locale JSON files (for example `src/locales/en.json`).",
      );
    }

    const locales =
      configuredLocales.length > 0
        ? configuredLocales
        : discoveredDirectoryCandidate
          ? discoveredDirectoryCandidate.locales
          : await discoverLocales(cwd, translationsPath);
    if (locales.length === 0) {
      throw new GlossConfigError(
        "NO_LOCALES",
        `No locales found. Add "locales" in config or place *.json files in ${translationsPath}.`,
      );
    }

    if (
      cfg.defaultLocale !== undefined &&
      (typeof cfg.defaultLocale !== "string" || !cfg.defaultLocale.trim())
    ) {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "`defaultLocale` must be a non-empty string when provided.",
      );
    }
    const defaultLocale =
      typeof cfg.defaultLocale === "string" && cfg.defaultLocale.trim()
        ? cfg.defaultLocale.trim()
        : locales.includes("en")
          ? "en"
          : locales[0];
    if (!locales.includes(defaultLocale)) {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "`defaultLocale` must be included in `locales`.",
      );
    }

    return {
      ...cfg,
      locales,
      defaultLocale,
      path: translationsPath,
      format: "json" as const,
      scan: normalizeScanConfig(cfg.scan),
    };
  } catch (e) {
    if (e instanceof GlossConfigError) {
      throw e;
    }

    const message = (e as Error).message;
    if (
      path.extname(configPath).toLowerCase() === ".ts" &&
      /Unexpected token 'export'/.test(message)
    ) {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "Could not parse gloss.config.ts in CommonJS mode. Use `module.exports = { ... }`, rename to gloss.config.cjs, or set package.json `type` to `module`.",
      );
    }

    throw new GlossConfigError(
      "INVALID_CONFIG",
      `Invalid ${path.basename(configPath)}: ${message}`,
    );
  }
}
