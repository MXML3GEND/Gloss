import fs from "node:fs/promises";
import path from "node:path";
import type { GlossConfig } from "@gloss/shared";
import { readAllTranslations } from "./fs.js";
import { createScanMatcher } from "./scanFilters.js";
import { flattenObject } from "./translationTree.js";
import {
  getInvalidTranslationKeyReason,
  isLikelyTranslationKey,
} from "./translationKeys.js";
import { inferUsageRoot, scanUsage } from "./usageScanner.js";

type KeyIssue = {
  key: string;
};

export type MissingTranslationIssue = KeyIssue & {
  missingLocales: string[];
  usedInCode: boolean;
};

export type OrphanKeyIssue = KeyIssue & {
  localesWithValue: string[];
};

export type InvalidKeyIssue = KeyIssue & {
  reason: string;
};

export type PlaceholderMismatchIssue = KeyIssue & {
  referenceLocale: string;
  expectedPlaceholders: string[];
  byLocale: Record<string, string[]>;
  mismatchedLocales: string[];
  pluralMismatches: Array<{
    locale: string;
    variable: string;
    expectedCategories: string[];
    actualCategories: string[];
  }>;
};

export type HardcodedTextIssue = {
  file: string;
  line: number;
  kind: "jsx_text" | "jsx_attribute";
  text: string;
};

export type GlossCheckResult = {
  ok: boolean;
  generatedAt: string;
  rootDir: string;
  locales: string[];
  summary: {
    missingTranslations: number;
    orphanKeys: number;
    invalidKeys: number;
    placeholderMismatches: number;
    hardcodedTexts: number;
    totalIssues: number;
  };
  missingTranslations: MissingTranslationIssue[];
  orphanKeys: OrphanKeyIssue[];
  invalidKeys: InvalidKeyIssue[];
  placeholderMismatches: PlaceholderMismatchIssue[];
  hardcodedTexts: HardcodedTextIssue[];
};

const HARDCODED_IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "out",
  "storybook-static",
]);

const HARDCODED_EXTENSIONS = new Set([".tsx", ".jsx"]);

const JSX_TEXT_REGEX =
  />\s*([A-Za-z][A-Za-z0-9 .,!?'’"’-]{1,})\s*</g;
const JSX_ATTRIBUTE_REGEX =
  /\b(?:title|label|placeholder|alt|aria-label|helperText|tooltip|description)\s*=\s*["'`]([^"'`]+)["'`]/g;
const SIMPLE_PLACEHOLDER_REGEX = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const ICU_PLACEHOLDER_REGEX =
  /\{([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(plural|select|selectordinal)\s*,/g;
const ICU_PLURAL_START_REGEX = /\{([A-Za-z_][A-Za-z0-9_]*)\s*,\s*plural\s*,/g;
const ICU_CATEGORY_REGEX = /(?:^|[\s,])(=?\d+|zero|one|two|few|many|other)\s*\{/g;

const projectRoot = () => process.env.INIT_CWD || process.cwd();

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

const withCollapsedWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const lineNumberAtIndex = (source: string, index: number) => {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) {
      line += 1;
    }
  }
  return line;
};

const hasIgnoredPathSegment = (relativePath: string) =>
  normalizePath(relativePath)
    .split("/")
    .some((segment) => HARDCODED_IGNORED_DIRECTORIES.has(segment));

const isLikelyHardcodedText = (value: string) => {
  const text = withCollapsedWhitespace(value);
  if (text.length < 3) {
    return false;
  }

  if (!/[A-Za-z]/.test(text)) {
    return false;
  }

  // Ignore values that clearly look like i18n keys, but keep plain words
  // like "test" or "Save" so hardcoded UI text is still detected.
  if (isLikelyTranslationKey(text) && /[.:/]/.test(text)) {
    return false;
  }

  if (/^(true|false|null|undefined)$/i.test(text)) {
    return false;
  }

  if (/^(https?:|\/|#)/i.test(text)) {
    return false;
  }

  if (/[=;(){}|]|=>/.test(text)) {
    return false;
  }

  if (/\b(?:return|const|let|var|function|import|export)\b/.test(text)) {
    return false;
  }

  if (/\b(?:void|promise|string|number|boolean|record|unknown|any|extends|infer)\b/i.test(text)) {
    return false;
  }

  return true;
};

const flattenByLocale = (cfg: GlossConfig, data: Record<string, unknown>) => {
  const result: Record<string, Record<string, string>> = {};

  for (const locale of cfg.locales) {
    const tree = (data[locale] as Record<string, unknown> | undefined) ?? {};
    result[locale] = flattenObject(tree);
  }

  return result;
};

const uniqueSorted = (items: Iterable<string>) =>
  Array.from(new Set(items)).sort((left, right) => left.localeCompare(right));

const asComparable = (items: string[]) => items.join("\u0000");

const findMatchingBraceEnd = (value: string, startIndex: number) => {
  let depth = 0;
  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
};

const extractPlaceholders = (value: string) => {
  const placeholders = new Set<string>();

  let match: RegExpExecArray | null = SIMPLE_PLACEHOLDER_REGEX.exec(value);
  while (match) {
    placeholders.add(match[1]);
    match = SIMPLE_PLACEHOLDER_REGEX.exec(value);
  }
  SIMPLE_PLACEHOLDER_REGEX.lastIndex = 0;

  match = ICU_PLACEHOLDER_REGEX.exec(value);
  while (match) {
    placeholders.add(match[1]);
    match = ICU_PLACEHOLDER_REGEX.exec(value);
  }
  ICU_PLACEHOLDER_REGEX.lastIndex = 0;

  return uniqueSorted(placeholders);
};

const extractPluralCategories = (value: string) => {
  const categoriesByVariable = new Map<string, Set<string>>();
  let match: RegExpExecArray | null = ICU_PLURAL_START_REGEX.exec(value);

  while (match) {
    const variable = match[1];
    const startIndex = match.index;
    const endIndex = findMatchingBraceEnd(value, startIndex);
    if (endIndex === -1) {
      match = ICU_PLURAL_START_REGEX.exec(value);
      continue;
    }

    const block = value.slice(startIndex, endIndex + 1);
    const categories = categoriesByVariable.get(variable) ?? new Set<string>();

    let categoryMatch: RegExpExecArray | null = ICU_CATEGORY_REGEX.exec(block);
    while (categoryMatch) {
      categories.add(categoryMatch[1]);
      categoryMatch = ICU_CATEGORY_REGEX.exec(block);
    }
    ICU_CATEGORY_REGEX.lastIndex = 0;

    categoriesByVariable.set(variable, categories);
    ICU_PLURAL_START_REGEX.lastIndex = endIndex + 1;
    match = ICU_PLURAL_START_REGEX.exec(value);
  }

  ICU_PLURAL_START_REGEX.lastIndex = 0;

  return new Map(
    Array.from(categoriesByVariable.entries()).map(([variable, categories]) => [
      variable,
      uniqueSorted(categories),
    ]),
  );
};

const scanHardcodedText = async (
  rootDir: string,
  cfg: GlossConfig,
): Promise<HardcodedTextIssue[]> => {
  const issues: HardcodedTextIssue[] = [];
  const seen = new Set<string>();
  const shouldScanFile = createScanMatcher(cfg.scan);

  const visitDirectory = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (
          entry.name.startsWith(".") ||
          HARDCODED_IGNORED_DIRECTORIES.has(entry.name)
        ) {
          continue;
        }

        await visitDirectory(fullPath);
        continue;
      }

      if (!entry.isFile() || !HARDCODED_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }

      const relativePath = normalizePath(path.relative(rootDir, fullPath));
      if (hasIgnoredPathSegment(relativePath) || !shouldScanFile(relativePath)) {
        continue;
      }

      const source = await fs.readFile(fullPath, "utf8");

      let textMatch: RegExpExecArray | null = JSX_TEXT_REGEX.exec(source);
      while (textMatch) {
        const text = withCollapsedWhitespace(textMatch[1]);
        if (isLikelyHardcodedText(text)) {
          const line = lineNumberAtIndex(source, textMatch.index);
          const dedupeKey = `${relativePath}:${line}:jsx_text:${text}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            issues.push({ file: relativePath, line, kind: "jsx_text", text });
          }
        }

        textMatch = JSX_TEXT_REGEX.exec(source);
      }
      JSX_TEXT_REGEX.lastIndex = 0;

      let attrMatch: RegExpExecArray | null = JSX_ATTRIBUTE_REGEX.exec(source);
      while (attrMatch) {
        const text = withCollapsedWhitespace(attrMatch[1]);
        if (isLikelyHardcodedText(text)) {
          const line = lineNumberAtIndex(source, attrMatch.index);
          const dedupeKey = `${relativePath}:${line}:jsx_attribute:${text}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            issues.push({ file: relativePath, line, kind: "jsx_attribute", text });
          }
        }

        attrMatch = JSX_ATTRIBUTE_REGEX.exec(source);
      }
      JSX_ATTRIBUTE_REGEX.lastIndex = 0;
    }
  };

  await visitDirectory(rootDir);
  issues.sort((left, right) => {
    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.text.localeCompare(right.text);
  });

  return issues;
};

export async function runGlossCheck(cfg: GlossConfig): Promise<GlossCheckResult> {
  const rootDir = projectRoot();
  const data = (await readAllTranslations(cfg)) as Record<string, unknown>;
  const flatByLocale = flattenByLocale(cfg, data);
  const usageRoot = inferUsageRoot(cfg);
  const usage = await scanUsage(usageRoot, cfg.scan);
  const usageKeys = new Set(Object.keys(usage));
  const translationKeys = new Set(
    cfg.locales.flatMap((locale) => Object.keys(flatByLocale[locale] ?? {})),
  );
  const allKeys = uniqueSorted([...translationKeys, ...usageKeys]);

  const missingTranslations: MissingTranslationIssue[] = [];
  for (const key of allKeys) {
    const missingLocales = cfg.locales.filter((locale) => {
      const value = flatByLocale[locale]?.[key];
      return value === undefined || value.trim() === "";
    });
    if (missingLocales.length > 0) {
      missingTranslations.push({
        key,
        missingLocales,
        usedInCode: usageKeys.has(key),
      });
    }
  }

  const orphanKeys: OrphanKeyIssue[] = [];
  for (const key of translationKeys) {
    if (usageKeys.has(key)) {
      continue;
    }

    const localesWithValue = cfg.locales.filter((locale) => {
      const value = flatByLocale[locale]?.[key];
      return value !== undefined && value.trim() !== "";
    });
    orphanKeys.push({ key, localesWithValue });
  }

  const invalidKeys: InvalidKeyIssue[] = [];
  for (const key of translationKeys) {
    const reason = getInvalidTranslationKeyReason(key);
    if (reason) {
      invalidKeys.push({ key, reason });
    }
  }

  const placeholderMismatches: PlaceholderMismatchIssue[] = [];
  for (const key of translationKeys) {
    const localesWithValue = cfg.locales.filter((locale) => {
      const value = flatByLocale[locale]?.[key];
      return value !== undefined && value.trim() !== "";
    });
    if (localesWithValue.length <= 1) {
      continue;
    }

    const referenceLocale = localesWithValue.includes(cfg.defaultLocale)
      ? cfg.defaultLocale
      : localesWithValue[0];
    const referenceValue = flatByLocale[referenceLocale][key];
    const expectedPlaceholders = extractPlaceholders(referenceValue);
    const expectedPluralByVariable = extractPluralCategories(referenceValue);
    const expectedPlaceholdersComparable = asComparable(expectedPlaceholders);
    const mismatchedLocales: string[] = [];
    const byLocale: Record<string, string[]> = {};
    const pluralMismatches: PlaceholderMismatchIssue["pluralMismatches"] = [];

    for (const locale of localesWithValue) {
      const value = flatByLocale[locale][key];
      const placeholders = extractPlaceholders(value);
      byLocale[locale] = placeholders;
      if (asComparable(placeholders) !== expectedPlaceholdersComparable) {
        mismatchedLocales.push(locale);
      }

      const actualPluralByVariable = extractPluralCategories(value);
      const pluralVariables = uniqueSorted([
        ...expectedPluralByVariable.keys(),
        ...actualPluralByVariable.keys(),
      ]);

      for (const variable of pluralVariables) {
        const expectedCategories = expectedPluralByVariable.get(variable) ?? [];
        const actualCategories = actualPluralByVariable.get(variable) ?? [];
        if (asComparable(expectedCategories) !== asComparable(actualCategories)) {
          pluralMismatches.push({
            locale,
            variable,
            expectedCategories,
            actualCategories,
          });
        }
      }
    }

    if (mismatchedLocales.length > 0 || pluralMismatches.length > 0) {
      placeholderMismatches.push({
        key,
        referenceLocale,
        expectedPlaceholders,
        byLocale,
        mismatchedLocales: uniqueSorted(mismatchedLocales),
        pluralMismatches,
      });
    }
  }

  const hardcodedTexts = await scanHardcodedText(usageRoot, cfg);
  const summary = {
    missingTranslations: missingTranslations.length,
    orphanKeys: orphanKeys.length,
    invalidKeys: invalidKeys.length,
    placeholderMismatches: placeholderMismatches.length,
    hardcodedTexts: hardcodedTexts.length,
    totalIssues:
      missingTranslations.length +
      orphanKeys.length +
      invalidKeys.length +
      placeholderMismatches.length +
      hardcodedTexts.length,
  };

  return {
    ok: summary.totalIssues === 0,
    generatedAt: new Date().toISOString(),
    rootDir: rootDir,
    locales: cfg.locales,
    summary,
    missingTranslations,
    orphanKeys,
    invalidKeys,
    placeholderMismatches,
    hardcodedTexts,
  };
}

type CheckOutputFormat = "human" | "json" | "both";

const printTable = (rows: Array<{ label: string; value: number }>) => {
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  console.log("");
  for (const row of rows) {
    console.log(`${row.label.padEnd(labelWidth)} : ${row.value}`);
  }
};

const printSample = (title: string, lines: string[]) => {
  console.log(`\n${title} (${lines.length})`);
  const limit = 12;
  for (const line of lines.slice(0, limit)) {
    console.log(`- ${line}`);
  }
  if (lines.length > limit) {
    console.log(`- ... +${lines.length - limit} more`);
  }
};

export const printGlossCheck = (
  result: GlossCheckResult,
  format: CheckOutputFormat,
) => {
  if (format === "human" || format === "both") {
    console.log(`Gloss check for ${result.rootDir}`);
    printTable([
      { label: "Missing translations", value: result.summary.missingTranslations },
      { label: "Orphan keys", value: result.summary.orphanKeys },
      { label: "Invalid keys", value: result.summary.invalidKeys },
      {
        label: "Placeholder mismatches",
        value: result.summary.placeholderMismatches,
      },
      { label: "Hardcoded text candidates", value: result.summary.hardcodedTexts },
      { label: "Total issues", value: result.summary.totalIssues },
    ]);

    printSample(
      "Missing translations",
      result.missingTranslations.map(
        (issue) =>
          `${issue.key} -> missing in [${issue.missingLocales.join(", ")}]${
            issue.usedInCode ? " (used)" : ""
          }`,
      ),
    );
    printSample(
      "Orphan keys",
      result.orphanKeys.map(
        (issue) =>
          `${issue.key} -> present in [${issue.localesWithValue.join(", ")}]`,
      ),
    );
    printSample(
      "Invalid keys",
      result.invalidKeys.map((issue) => `${issue.key} -> ${issue.reason}`),
    );
    printSample(
      "Placeholder mismatches",
      result.placeholderMismatches.map((issue) => {
        const pluralInfo =
          issue.pluralMismatches.length > 0
            ? `; plural mismatches: ${issue.pluralMismatches.length}`
            : "";
        return `${issue.key} -> expected [${issue.expectedPlaceholders.join(
          ", ",
        )}] from ${issue.referenceLocale}; locales: [${issue.mismatchedLocales.join(
          ", ",
        )}]${pluralInfo}`;
      }),
    );
    printSample(
      "Hardcoded text candidates",
      result.hardcodedTexts.map(
        (issue) => `${issue.file}:${issue.line} [${issue.kind}] ${issue.text}`,
      ),
    );

    console.log(
      result.ok
        ? "\nResult: PASS"
        : "\nResult: FAIL (non-zero exit code for CI guardrails)",
    );
  }

  if (format === "json" || format === "both") {
    if (format === "both") {
      console.log("\nJSON output:");
    }
    console.log(JSON.stringify(result, null, 2));
  }
};
