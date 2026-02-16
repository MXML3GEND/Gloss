import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { GlossConfig } from "@gloss/shared";
import { readAllTranslations } from "./fs.js";
import { flattenObject } from "./translationTree.js";

const execFileAsync = promisify(execFile);

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

export type GitDiffResult = {
  available: boolean;
  baseRef: string;
  resolvedBaseRef?: string;
  generatedAt: string;
  keys: GitKeyDiff[];
  error?: string;
};

const projectRoot = () => process.env.INIT_CWD || process.cwd();

const normalizePath = (value: string) => value.split(path.sep).join("/");

const runGit = async (cwd: string, args: string[]) => {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
};

const resolveLocaleFileRelativePath = (
  cfg: GlossConfig,
  locale: string,
  cwd: string,
) => {
  const directory = path.isAbsolute(cfg.path) ? cfg.path : path.resolve(cwd, cfg.path);
  const filePath = path.resolve(directory, `${locale}.json`);
  return normalizePath(path.relative(cwd, filePath));
};

const readJsonFromGit = async (
  cwd: string,
  ref: string,
  fileRelativePath: string,
) => {
  if (
    !fileRelativePath ||
    fileRelativePath.startsWith("../") ||
    path.isAbsolute(fileRelativePath)
  ) {
    return {};
  }

  try {
    const raw = await runGit(cwd, ["show", `${ref}:${fileRelativePath}`]);
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export async function buildGitKeyDiff(
  cfg: GlossConfig,
  baseRef = "origin/main",
): Promise<GitDiffResult> {
  const cwd = projectRoot();

  try {
    const insideRepo = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    if (insideRepo !== "true") {
      return {
        available: false,
        baseRef,
        generatedAt: new Date().toISOString(),
        keys: [],
        error: "Current directory is not a git repository.",
      };
    }
  } catch {
    return {
      available: false,
      baseRef,
      generatedAt: new Date().toISOString(),
      keys: [],
      error: "Git is not available in this project.",
    };
  }

  let resolvedBaseRef = "";
  try {
    resolvedBaseRef = await runGit(cwd, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  } catch {
    return {
      available: false,
      baseRef,
      generatedAt: new Date().toISOString(),
      keys: [],
      error: `Base ref "${baseRef}" was not found.`,
    };
  }

  const currentTranslations = await readAllTranslations(cfg);
  const currentFlatByLocale: Record<string, Record<string, string>> = {};
  const baseFlatByLocale: Record<string, Record<string, string>> = {};

  for (const locale of cfg.locales) {
    currentFlatByLocale[locale] = flattenObject(
      (currentTranslations[locale] ?? {}) as Record<string, unknown>,
    );

    const localeRelativePath = resolveLocaleFileRelativePath(cfg, locale, cwd);
    const baseJson = await readJsonFromGit(cwd, resolvedBaseRef, localeRelativePath);
    baseFlatByLocale[locale] = flattenObject(baseJson);
  }

  const allKeys = Array.from(
    new Set(
      cfg.locales.flatMap((locale) => [
        ...Object.keys(baseFlatByLocale[locale] ?? {}),
        ...Object.keys(currentFlatByLocale[locale] ?? {}),
      ]),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const keys: GitKeyDiff[] = [];
  for (const key of allKeys) {
    const changes: GitKeyLocaleChange[] = [];

    for (const locale of cfg.locales) {
      const before = baseFlatByLocale[locale]?.[key] ?? "";
      const after = currentFlatByLocale[locale]?.[key] ?? "";
      if (before === after) {
        continue;
      }

      const beforeMissing = before.trim() === "";
      const afterMissing = after.trim() === "";
      const kind: GitKeyLocaleChange["kind"] =
        beforeMissing && !afterMissing
          ? "added"
          : !beforeMissing && afterMissing
            ? "removed"
            : "changed";

      changes.push({ locale, kind, before, after });
    }

    if (changes.length > 0) {
      keys.push({
        key,
        changes: changes.sort((left, right) => left.locale.localeCompare(right.locale)),
      });
    }
  }

  return {
    available: true,
    baseRef,
    resolvedBaseRef,
    generatedAt: new Date().toISOString(),
    keys,
  };
}
