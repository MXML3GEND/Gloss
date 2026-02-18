import fs from "node:fs/promises";
import path from "node:path";

export type IssueSummaryCounts = {
  missingTranslations: number;
  orphanKeys: number;
  invalidKeys: number;
  placeholderMismatches: number;
  hardcodedTexts: number;
  errorIssues: number;
  warningIssues: number;
  totalIssues: number;
};

type BaselineFile = {
  schemaVersion: 1;
  updatedAt: string;
  summary: IssueSummaryCounts;
};

export type IssueBaselineDelta = {
  missingTranslations: number;
  orphanKeys: number;
  invalidKeys: number;
  placeholderMismatches: number;
  hardcodedTexts: number;
  errorIssues: number;
  warningIssues: number;
  totalIssues: number;
};

export type IssueBaselineReport = {
  hasPrevious: boolean;
  baselinePath: string;
  previousUpdatedAt: string | null;
  currentUpdatedAt: string;
  delta: IssueBaselineDelta;
};

const BASELINE_DIRECTORY = ".gloss";
const BASELINE_FILENAME = "baseline.json";

const SUMMARY_KEYS: Array<keyof IssueSummaryCounts> = [
  "missingTranslations",
  "orphanKeys",
  "invalidKeys",
  "placeholderMismatches",
  "hardcodedTexts",
  "errorIssues",
  "warningIssues",
  "totalIssues",
];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const emptyDelta = (): IssueBaselineDelta => ({
  missingTranslations: 0,
  orphanKeys: 0,
  invalidKeys: 0,
  placeholderMismatches: 0,
  hardcodedTexts: 0,
  errorIssues: 0,
  warningIssues: 0,
  totalIssues: 0,
});

const normalizeSummary = (value: unknown): IssueSummaryCounts | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<IssueSummaryCounts>;
  const next = {} as IssueSummaryCounts;

  for (const key of SUMMARY_KEYS) {
    const entry = source[key];
    if (!isFiniteNumber(entry)) {
      return null;
    }
    next[key] = entry;
  }

  return next;
};

const baselineFilePath = (rootDir: string) =>
  path.join(rootDir, BASELINE_DIRECTORY, BASELINE_FILENAME);

const readBaselineFile = async (rootDir: string): Promise<BaselineFile | null> => {
  const filePath = baselineFilePath(rootDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BaselineFile>;
    if (parsed.schemaVersion !== 1 || typeof parsed.updatedAt !== "string") {
      return null;
    }
    const summary = normalizeSummary(parsed.summary);
    if (!summary) {
      return null;
    }
    return {
      schemaVersion: 1,
      updatedAt: parsed.updatedAt,
      summary,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return null;
    }
    return null;
  }
};

const computeDelta = (
  current: IssueSummaryCounts,
  previous: IssueSummaryCounts | null,
): IssueBaselineDelta => {
  if (!previous) {
    return emptyDelta();
  }

  const delta = {} as IssueBaselineDelta;
  for (const key of SUMMARY_KEYS) {
    delta[key] = current[key] - previous[key];
  }
  return delta;
};

export async function updateIssueBaseline(
  rootDir: string,
  summary: IssueSummaryCounts,
): Promise<IssueBaselineReport> {
  const previous = await readBaselineFile(rootDir);
  const delta = computeDelta(summary, previous?.summary ?? null);
  const currentUpdatedAt = new Date().toISOString();
  const baseline: BaselineFile = {
    schemaVersion: 1,
    updatedAt: currentUpdatedAt,
    summary,
  };
  const filePath = baselineFilePath(rootDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await fs.rename(`${filePath}.tmp`, filePath);

  return {
    hasPrevious: Boolean(previous),
    baselinePath: path.relative(rootDir, filePath) || filePath,
    previousUpdatedAt: previous?.updatedAt ?? null,
    currentUpdatedAt,
    delta,
  };
}

export async function resetIssueBaseline(rootDir: string) {
  const filePath = baselineFilePath(rootDir);
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
    baselinePath: path.relative(rootDir, filePath) || filePath,
  };
}
