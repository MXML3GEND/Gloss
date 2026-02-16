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

  const scan = value as { include?: unknown; exclude?: unknown };
  const include = normalizeScanPatterns(scan.include);
  const exclude = normalizeScanPatterns(scan.exclude);

  if (!include && !exclude) {
    return undefined;
  }

  return { include, exclude };
};

const CONFIG_FILE_NAMES = [
  "gloss.config.ts",
  "gloss.config.mts",
  "gloss.config.js",
  "gloss.config.mjs",
  "gloss.config.cjs",
];

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
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.basename(entry.name, ".json").trim())
      .filter((entry) => entry.length > 0)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
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

    if (typeof cfg.path !== "string" || !cfg.path.trim()) {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "`path` must be a non-empty string.",
      );
    }
    const translationsPath = cfg.path.trim();

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

    const locales =
      configuredLocales.length > 0
        ? configuredLocales
        : await discoverLocales(cwd, translationsPath);
    if (locales.length === 0) {
      throw new GlossConfigError(
        "NO_LOCALES",
        `No locales found. Add "locales" in config or place *.json files in ${translationsPath}.`,
      );
    }

    if (typeof cfg.defaultLocale !== "string" || !cfg.defaultLocale.trim()) {
      throw new GlossConfigError(
        "INVALID_CONFIG",
        "`defaultLocale` must be a non-empty string.",
      );
    }
    const defaultLocale = cfg.defaultLocale.trim();
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
