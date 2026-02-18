import type { GlossConfig } from "@gloss/shared";
import {
  clearCacheMetrics,
  readCacheMetrics,
  type CacheMetricsEntry,
} from "./cacheMetrics.js";
import {
  clearKeyUsageCache,
  getKeyUsageCacheStatus,
  keyUsageCacheKey,
} from "./usage.js";
import {
  clearUsageScannerCache,
  getUsageScannerCacheStatus,
  inferUsageRoot,
  usageScannerCacheKey,
} from "./usageScanner.js";

type CacheBucketStatus = {
  cacheKey: string;
  fileCount: number;
  totalSizeBytes: number;
  oldestMtimeMs: number | null;
  staleRelativeToConfig: boolean;
  source: "metrics" | "memory" | "missing";
};

export type CacheStatusReport = {
  metricsFileFound: boolean;
  metricsUpdatedAt: string | null;
  usageScanner: CacheBucketStatus;
  keyUsage: CacheBucketStatus;
  totalCachedFiles: number;
  totalCachedSizeBytes: number;
  oldestEntryAgeMs: number | null;
  staleRelativeToConfig: boolean;
};

const fromMetricsEntry = (
  cacheKey: string,
  entry: CacheMetricsEntry | null,
  staleRelativeToConfig: boolean,
): CacheBucketStatus => {
  if (!entry) {
    return {
      cacheKey,
      fileCount: 0,
      totalSizeBytes: 0,
      oldestMtimeMs: null,
      staleRelativeToConfig,
      source: "missing",
    };
  }

  return {
    cacheKey,
    fileCount: entry.fileCount,
    totalSizeBytes: entry.totalSizeBytes,
    oldestMtimeMs: entry.oldestMtimeMs,
    staleRelativeToConfig,
    source: "metrics",
  };
};

export const getCacheStatus = async (
  rootDir: string,
  cfg: GlossConfig,
): Promise<CacheStatusReport> => {
  const usageKey = usageScannerCacheKey(inferUsageRoot(cfg), cfg.scan);
  const keyUsageKey = keyUsageCacheKey(cfg);
  const metrics = await readCacheMetrics(rootDir);

  const metricsUsage = metrics?.usageScanner?.[usageKey] ?? null;
  const metricsKeyUsage = metrics?.keyUsage?.[keyUsageKey] ?? null;
  const usageStale = !metricsUsage;
  const keyUsageStale = !metricsKeyUsage;

  const usageBucket = metricsUsage
    ? fromMetricsEntry(usageKey, metricsUsage, usageStale)
    : (() => {
        const memory = getUsageScannerCacheStatus(inferUsageRoot(cfg), cfg.scan);
        return {
          ...memory,
          staleRelativeToConfig: memory.fileCount === 0,
          source: "memory" as const,
        };
      })();

  const keyUsageBucket = metricsKeyUsage
    ? fromMetricsEntry(keyUsageKey, metricsKeyUsage, keyUsageStale)
    : (() => {
        const memory = getKeyUsageCacheStatus(cfg);
        return {
          ...memory,
          staleRelativeToConfig: memory.fileCount === 0,
          source: "memory" as const,
        };
      })();

  const totalCachedFiles = usageBucket.fileCount + keyUsageBucket.fileCount;
  const totalCachedSizeBytes =
    usageBucket.totalSizeBytes + keyUsageBucket.totalSizeBytes;

  const oldestMtimeCandidates = [usageBucket.oldestMtimeMs, keyUsageBucket.oldestMtimeMs]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const oldestMtimeMs =
    oldestMtimeCandidates.length > 0 ? Math.min(...oldestMtimeCandidates) : null;
  const oldestEntryAgeMs =
    oldestMtimeMs === null ? null : Math.max(0, Date.now() - oldestMtimeMs);

  return {
    metricsFileFound: metrics !== null,
    metricsUpdatedAt: metrics?.updatedAt ?? null,
    usageScanner: usageBucket,
    keyUsage: keyUsageBucket,
    totalCachedFiles,
    totalCachedSizeBytes,
    oldestEntryAgeMs,
    staleRelativeToConfig:
      usageBucket.staleRelativeToConfig || keyUsageBucket.staleRelativeToConfig,
  };
};

export const clearGlossCaches = async (rootDir: string) => {
  const usage = clearUsageScannerCache();
  const keyUsage = clearKeyUsageCache();
  const metrics = await clearCacheMetrics(rootDir);

  return {
    usage,
    keyUsage,
    metrics,
  };
};
