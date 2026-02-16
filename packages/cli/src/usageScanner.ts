import fs from "node:fs/promises";
import path from "node:path";
import type { GlossConfig, ScanConfig } from "@gloss/shared";
import { createScanMatcher } from "./scanFilters.js";
import { isLikelyTranslationKey } from "./translationKeys.js";

export type UsageMap = Record<
  string,
  {
    count: number;
    files: string[];
  }
>;

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  "coverage",
  "storybook-static",
]);

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const USAGE_REGEXES = [
  /\b(?:t|i18n\.t|translate)\(\s*["'`]([^"'`]+)["'`]\s*[\),]/g,
  /\bi18nKey\s*=\s*["'`]([^"'`]+)["'`]/g,
];

const projectRoot = () => process.env.INIT_CWD || process.cwd();

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

const isScannableFile = (fileName: string) =>
  SCANNED_EXTENSIONS.has(path.extname(fileName));

const hasIgnoredPathSegment = (relativePath: string) =>
  normalizePath(relativePath)
    .split("/")
    .some((segment) => IGNORED_DIRECTORIES.has(segment));

const resolveTranslationsDir = (cfg: GlossConfig, cwd: string) => {
  if (path.isAbsolute(cfg.path)) {
    return cfg.path;
  }

  return path.resolve(cwd, cfg.path);
};

export const inferUsageRoot = (cfg: GlossConfig) => {
  const cwd = projectRoot();
  const translationsDirectory = resolveTranslationsDir(cfg, cwd);
  const relativeToCwd = path.relative(cwd, translationsDirectory);
  const isInsideProject =
    relativeToCwd.length === 0 ||
    (!relativeToCwd.startsWith("..") && !path.isAbsolute(relativeToCwd));

  if (!isInsideProject) {
    return cwd;
  }

  const parentDirectory = path.dirname(translationsDirectory);

  if (path.basename(parentDirectory) === "src") {
    return path.dirname(parentDirectory);
  }

  return parentDirectory;
};

export async function scanUsage(
  rootDir: string = projectRoot(),
  scan?: ScanConfig,
): Promise<UsageMap> {
  const usage: UsageMap = {};
  const seenFilesByKey = new Map<string, Set<string>>();
  const shouldScanFile = createScanMatcher(scan);

  const scanDirectory = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        await scanDirectory(fullPath);
        continue;
      }

      if (!entry.isFile() || !isScannableFile(entry.name)) {
        continue;
      }

      const relativePath = normalizePath(path.relative(rootDir, fullPath));
      if (hasIgnoredPathSegment(relativePath)) {
        continue;
      }

      if (!shouldScanFile(relativePath)) {
        continue;
      }

      const source = await fs.readFile(fullPath, "utf8");
      for (const usageRegex of USAGE_REGEXES) {
        let match = usageRegex.exec(source);

        while (match) {
          const key = match[1]?.trim();
          if (key && isLikelyTranslationKey(key)) {
            if (!usage[key]) {
              usage[key] = { count: 0, files: [] };
              seenFilesByKey.set(key, new Set());
            }

            usage[key].count += 1;
            const fileSet = seenFilesByKey.get(key);

            if (fileSet && !fileSet.has(relativePath)) {
              fileSet.add(relativePath);
              usage[key].files.push(relativePath);
            }
          }

          match = usageRegex.exec(source);
        }

        usageRegex.lastIndex = 0;
      }
    }
  };

  await scanDirectory(rootDir);

  for (const value of Object.values(usage)) {
    value.files.sort((left, right) => left.localeCompare(right));
  }

  return usage;
}
