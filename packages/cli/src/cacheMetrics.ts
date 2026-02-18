import fs from "node:fs/promises";
import path from "node:path";

export type CacheKind = "usageScanner" | "keyUsage";

export type CacheMetricsEntry = {
  cacheKey: string;
  fileCount: number;
  totalSizeBytes: number;
  oldestMtimeMs: number | null;
  updatedAt: string;
};

type CacheMetricsFile = {
  schemaVersion: 1;
  updatedAt: string;
  usageScanner: Record<string, CacheMetricsEntry>;
  keyUsage: Record<string, CacheMetricsEntry>;
};

const CACHE_DIRECTORY = ".gloss";
const CACHE_METRICS_FILENAME = "cache-metrics.json";

const metricsFilePath = (rootDir: string) =>
  path.join(rootDir, CACHE_DIRECTORY, CACHE_METRICS_FILENAME);

const emptyMetrics = (): CacheMetricsFile => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  usageScanner: {},
  keyUsage: {},
});

const normalizeEntry = (value: unknown): CacheMetricsEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<CacheMetricsEntry>;
  if (typeof source.cacheKey !== "string" || source.cacheKey.trim().length === 0) {
    return null;
  }

  if (
    typeof source.fileCount !== "number" ||
    !Number.isFinite(source.fileCount) ||
    source.fileCount < 0
  ) {
    return null;
  }

  if (
    typeof source.totalSizeBytes !== "number" ||
    !Number.isFinite(source.totalSizeBytes) ||
    source.totalSizeBytes < 0
  ) {
    return null;
  }

  if (
    source.oldestMtimeMs !== null &&
    (typeof source.oldestMtimeMs !== "number" || !Number.isFinite(source.oldestMtimeMs))
  ) {
    return null;
  }

  if (typeof source.updatedAt !== "string") {
    return null;
  }

  return {
    cacheKey: source.cacheKey,
    fileCount: source.fileCount,
    totalSizeBytes: source.totalSizeBytes,
    oldestMtimeMs: source.oldestMtimeMs,
    updatedAt: source.updatedAt,
  };
};

const normalizeEntries = (value: unknown): Record<string, CacheMetricsEntry> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const entries: Record<string, CacheMetricsEntry> = {};
  for (const [key, rawEntry] of Object.entries(source)) {
    const entry = normalizeEntry(rawEntry);
    if (entry) {
      entries[key] = entry;
    }
  }
  return entries;
};

export const readCacheMetrics = async (rootDir: string): Promise<CacheMetricsFile | null> => {
  const filePath = metricsFilePath(rootDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CacheMetricsFile>;
    if (parsed.schemaVersion !== 1 || typeof parsed.updatedAt !== "string") {
      return null;
    }

    return {
      schemaVersion: 1,
      updatedAt: parsed.updatedAt,
      usageScanner: normalizeEntries(parsed.usageScanner),
      keyUsage: normalizeEntries(parsed.keyUsage),
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return null;
    }
    return null;
  }
};

export const updateCacheMetrics = async (
  rootDir: string,
  kind: CacheKind,
  entry: CacheMetricsEntry,
) => {
  const existing = (await readCacheMetrics(rootDir)) ?? emptyMetrics();
  const updatedAt = new Date().toISOString();
  const next: CacheMetricsFile = {
    ...existing,
    updatedAt,
    [kind]: {
      ...existing[kind],
      [entry.cacheKey]: {
        ...entry,
        updatedAt,
      },
    },
  };
  const filePath = metricsFilePath(rootDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(`${filePath}.tmp`, filePath);
};

export const clearCacheMetrics = async (rootDir: string) => {
  const filePath = metricsFilePath(rootDir);
  let existed = true;
  try {
    await fs.rm(filePath);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      existed = false;
    } else {
      throw error;
    }
  }

  return {
    existed,
    path: path.relative(rootDir, filePath) || filePath,
  };
};
