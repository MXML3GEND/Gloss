import fs from "node:fs/promises";
import path from "node:path";
import type { GlossConfig, TranslationsByLocale } from "@gloss/shared";

const DEFAULT_WRITE_LOCK_TIMEOUT_MS = 4_000;
const DEFAULT_WRITE_LOCK_RETRY_MS = 50;
const WRITE_LOCK_FILE_NAME = ".gloss-write.lock";

export class WriteLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteLockError";
  }
}

function projectRoot() {
  return process.env.INIT_CWD || process.cwd();
}

function translationsDir(cfg: GlossConfig) {
  if (path.isAbsolute(cfg.path)) {
    return cfg.path;
  }

  return path.join(projectRoot(), cfg.path);
}

function localeFile(cfg: GlossConfig, locale: string) {
  return path.join(translationsDir(cfg), `${locale}.json`);
}

const compareKeys = (left: string, right: string) => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const sortTranslationTree = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => sortTranslationTree(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  const entries = Object.entries(value).sort(([leftKey], [rightKey]) =>
    compareKeys(leftKey, rightKey),
  );

  for (const [key, entryValue] of entries) {
    sorted[key] = sortTranslationTree(entryValue);
  }

  return sorted;
};

const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const writeLockTimeoutMs = () =>
  parsePositiveInteger(
    process.env.GLOSS_WRITE_LOCK_TIMEOUT_MS,
    DEFAULT_WRITE_LOCK_TIMEOUT_MS,
  );

const writeLockRetryMs = () =>
  parsePositiveInteger(
    process.env.GLOSS_WRITE_LOCK_RETRY_MS,
    DEFAULT_WRITE_LOCK_RETRY_MS,
  );

const withTranslationsWriteLock = async <T>(
  dir: string,
  run: () => Promise<T>,
) => {
  await fs.mkdir(dir, { recursive: true });

  const lockFilePath = path.join(dir, WRITE_LOCK_FILE_NAME);
  const timeoutMs = writeLockTimeoutMs();
  const retryMs = writeLockRetryMs();
  const startTime = Date.now();

  let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null;

  while (!lockHandle) {
    try {
      lockHandle = await fs.open(lockFilePath, "wx");
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code !== "EEXIST") {
        throw error;
      }

      if (Date.now() - startTime >= timeoutMs) {
        throw new WriteLockError(
          "Could not save translations because another Gloss save is in progress. Try again.",
        );
      }

      await sleep(retryMs);
    }
  }

  try {
    return await run();
  } finally {
    await lockHandle.close().catch(() => undefined);
    await fs.unlink(lockFilePath).catch(() => undefined);
  }
};

export async function readAllTranslations(
  cfg: GlossConfig,
): Promise<TranslationsByLocale> {
  const out: TranslationsByLocale = {};
  for (const locale of cfg.locales) {
    const file = localeFile(cfg, locale);
    try {
      const raw = await fs.readFile(file, "utf8");
      out[locale] = JSON.parse(raw);
    } catch {
      out[locale] = {}; // start empty if missing
    }
  }
  return out;
}

export async function writeAllTranslations(
  cfg: GlossConfig,
  data: TranslationsByLocale,
) {
  const dir = translationsDir(cfg);
  await withTranslationsWriteLock(dir, async () => {
    const serialized = cfg.locales.map((locale) => {
      return {
        locale,
        filePath: localeFile(cfg, locale),
        json: JSON.stringify(sortTranslationTree(data[locale] ?? {}), null, 2) + "\n",
      };
    });

    const operationId = `${Date.now()}-${process.pid}`;
    const tempFiles: string[] = [];

    try {
      for (const entry of serialized) {
        const tempPath = `${entry.filePath}.tmp-${operationId}-${entry.locale}`;
        await fs.writeFile(tempPath, entry.json, "utf8");
        tempFiles.push(tempPath);
      }

      for (let index = 0; index < serialized.length; index += 1) {
        await fs.rename(tempFiles[index], serialized[index].filePath);
      }
    } catch (error) {
      await Promise.allSettled(tempFiles.map((filePath) => fs.unlink(filePath)));
      throw error;
    }
  });
}
