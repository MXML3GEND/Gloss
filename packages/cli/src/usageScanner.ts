import fs from "node:fs/promises";
import path from "node:path";
import type { GlossConfig, ScanConfig } from "@gloss/shared";
import { updateCacheMetrics } from "./cacheMetrics.js";
import { createScanMatcher } from "./scanFilters.js";
import { extractTranslationKeys } from "./usageExtractor.js";

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

const projectRoot = () => process.env.INIT_CWD || process.cwd();

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

type UsageFileCacheEntry = {
  signature: string;
  keys: string[];
  mtimeMs: number;
  sizeBytes: number;
};

type UsageScannerCache = {
  files: Map<string, UsageFileCacheEntry>;
};

const usageScannerCache = new Map<string, UsageScannerCache>();

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

export const usageScannerCacheKey = (rootDir: string, scan?: ScanConfig) => {
  const normalizedRoot = path.resolve(rootDir);
  return `${normalizedRoot}::${JSON.stringify(scan ?? {})}`;
};

const fileSignature = (mtimeMs: number, size: number) => `${mtimeMs}:${size}`;

const mtimeFromEntry = (entry: UsageFileCacheEntry) => {
  if (typeof entry.mtimeMs === "number" && Number.isFinite(entry.mtimeMs)) {
    return entry.mtimeMs;
  }
  const parsed = Number.parseFloat(entry.signature.split(":")[0] ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};

const sizeFromEntry = (entry: UsageFileCacheEntry) => {
  if (typeof entry.sizeBytes === "number" && Number.isFinite(entry.sizeBytes)) {
    return entry.sizeBytes;
  }
  const parsed = Number.parseInt(entry.signature.split(":")[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const summarizeCacheEntries = (entries: Iterable<UsageFileCacheEntry>) => {
  let fileCount = 0;
  let totalSizeBytes = 0;
  let oldestMtimeMs: number | null = null;

  for (const entry of entries) {
    fileCount += 1;
    totalSizeBytes += sizeFromEntry(entry);
    const mtime = mtimeFromEntry(entry);
    if (mtime !== null) {
      oldestMtimeMs = oldestMtimeMs === null ? mtime : Math.min(oldestMtimeMs, mtime);
    }
  }

  return { fileCount, totalSizeBytes, oldestMtimeMs };
};

export const getUsageScannerCacheStatus = (rootDir: string, scan?: ScanConfig) => {
  const cacheKey = usageScannerCacheKey(rootDir, scan);
  const bucket = usageScannerCache.get(cacheKey);
  if (!bucket) {
    return {
      cacheKey,
      fileCount: 0,
      totalSizeBytes: 0,
      oldestMtimeMs: null as number | null,
    };
  }

  return {
    cacheKey,
    ...summarizeCacheEntries(bucket.files.values()),
  };
};

export const clearUsageScannerCache = () => {
  const bucketCount = usageScannerCache.size;
  let fileCount = 0;
  for (const bucket of usageScannerCache.values()) {
    fileCount += bucket.files.size;
  }
  usageScannerCache.clear();
  return { bucketCount, fileCount };
};

type ScanUsageOptions = {
  useCache?: boolean;
};

export async function scanUsage(
  rootDir: string = projectRoot(),
  scan?: ScanConfig,
  options?: ScanUsageOptions,
): Promise<UsageMap> {
  const useCache = options?.useCache !== false;
  const cacheKey = usageScannerCacheKey(rootDir, scan);
  const previousCache = useCache ? usageScannerCache.get(cacheKey) : undefined;
  const nextFiles = new Map<string, UsageFileCacheEntry>();
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

      const stat = await fs.stat(fullPath);
      const signature = fileSignature(stat.mtimeMs, stat.size);
      const cached = previousCache?.files.get(relativePath);

      if (cached && cached.signature === signature) {
        nextFiles.set(relativePath, cached);
        continue;
      }

      const source = await fs.readFile(fullPath, "utf8");
      const keys = extractTranslationKeys(source, fullPath, scan?.mode);
      nextFiles.set(relativePath, {
        signature,
        keys,
        mtimeMs: stat.mtimeMs,
        sizeBytes: stat.size,
      });
    }
  };

  await scanDirectory(rootDir);

  if (useCache) {
    usageScannerCache.set(cacheKey, { files: nextFiles });
    const summary = summarizeCacheEntries(nextFiles.values());
    try {
      await updateCacheMetrics(projectRoot(), "usageScanner", {
        cacheKey,
        ...summary,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal: cache metrics are observability only.
    }
  }

  const usage: UsageMap = {};
  const seenFilesByKey = new Map<string, Set<string>>();

  for (const [relativePath, fileData] of nextFiles.entries()) {
    for (const key of fileData.keys) {
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
  }

  for (const value of Object.values(usage)) {
    value.files.sort((left, right) => left.localeCompare(right));
  }

  return usage;
}
