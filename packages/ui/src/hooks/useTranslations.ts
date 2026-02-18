import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useDuplicateValues } from "./useDuplicateValues";
import type { DialogApi } from "./useModalDialog";
import { flattenObject, unflattenObject } from "../utils/translationTree";
import type {
  DuplicateValueGroup,
  FlatTranslationsByLocale,
  GitKeyDiff,
  HardcodedTextIssue,
  IssueBaselineReport,
  IssuesInboxItem,
  KeyUsageFile,
  KeyUsagePage,
  NamespaceTableGroup,
  NamespaceTreeNode,
  TableFilterRule,
  TableSortConfig,
  TranslateFn,
  TranslationTree,
  UsageMap,
  WorkspaceMode,
} from "../types/translations";
import { isMissingValue } from "../types/translations";

const cloneTranslations = (
  source: FlatTranslationsByLocale,
): FlatTranslationsByLocale => {
  const next: FlatTranslationsByLocale = {};

  for (const [locale, localeData] of Object.entries(source)) {
    next[locale] = { ...(localeData ?? {}) };
  }

  return next;
};

const serializeTranslations = (source: FlatTranslationsByLocale): string => {
  const ordered: FlatTranslationsByLocale = {};

  for (const locale of Object.keys(source).sort()) {
    const localeValues = source[locale] ?? {};
    ordered[locale] = {};

    for (const key of Object.keys(localeValues).sort()) {
      ordered[locale][key] = localeValues[key];
    }
  }

  return JSON.stringify(ordered);
};

const flattenTranslations = (
  json: Record<string, TranslationTree>,
): FlatTranslationsByLocale => {
  const flattened: FlatTranslationsByLocale = {};

  for (const [locale, translationTree] of Object.entries(json)) {
    flattened[locale] = flattenObject(translationTree);
  }

  return flattened;
};

const parseUsageEntries = (entries: unknown): KeyUsageFile[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const value = entry as Partial<KeyUsageFile>;
      return {
        id: typeof value.id === "string" ? value.id : "",
        file: typeof value.file === "string" ? value.file : "",
        keys: Array.isArray(value.keys)
          ? value.keys.filter((key): key is string => typeof key === "string")
          : [],
      };
    })
    .filter((entry) => entry.id && entry.file)
    .sort((left, right) => left.file.localeCompare(right.file));
};

const parseGitDiffEntries = (entries: unknown): GitKeyDiff[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const value = entry as Partial<GitKeyDiff>;
      const key = typeof value.key === "string" ? value.key : "";
      const changes = Array.isArray(value.changes)
        ? value.changes
            .map((change) => {
              const changeValue = change as Partial<GitKeyDiff["changes"][number]>;
              const locale =
                typeof changeValue.locale === "string" ? changeValue.locale : "";
              const kind = changeValue.kind;
              const before =
                typeof changeValue.before === "string" ? changeValue.before : "";
              const after =
                typeof changeValue.after === "string" ? changeValue.after : "";

              if (!locale) {
                return null;
              }
              if (kind !== "added" && kind !== "removed" && kind !== "changed") {
                return null;
              }

              return { locale, kind, before, after };
            })
            .filter(
              (change): change is GitKeyDiff["changes"][number] => change !== null,
            )
        : [];

      return { key, changes };
    })
    .filter((entry) => entry.key.length > 0 && entry.changes.length > 0)
    .sort((left, right) => left.key.localeCompare(right.key));
};

const parseIssueBaselineReport = (value: unknown): IssueBaselineReport | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<IssueBaselineReport>;
  const delta = source.delta as Partial<IssueBaselineReport["delta"]> | undefined;
  if (
    typeof source.hasPrevious !== "boolean" ||
    typeof source.baselinePath !== "string" ||
    (source.previousUpdatedAt !== null &&
      typeof source.previousUpdatedAt !== "string") ||
    typeof source.currentUpdatedAt !== "string" ||
    !delta ||
    typeof delta !== "object"
  ) {
    return null;
  }

  const entries: Array<keyof IssueBaselineReport["delta"]> = [
    "missingTranslations",
    "orphanKeys",
    "invalidKeys",
    "placeholderMismatches",
    "hardcodedTexts",
    "errorIssues",
    "warningIssues",
    "totalIssues",
  ];

  const parsedDelta = {} as IssueBaselineReport["delta"];
  for (const key of entries) {
    const entry = delta[key];
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return null;
    }
    parsedDelta[key] = entry;
  }

  return {
    hasPrevious: source.hasPrevious,
    baselinePath: source.baselinePath,
    previousUpdatedAt: source.previousUpdatedAt ?? null,
    currentUpdatedAt: source.currentUpdatedAt,
    delta: parsedDelta,
  };
};

const buildDefaultCommonKey = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  const safeSlug = slug.slice(0, 48) || "value";
  return `common.${safeSlug}`;
};

const PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_]+)\}/g;

const placeholderSignature = (value: string) => {
  const placeholders = new Set<string>();
  let match = PLACEHOLDER_REGEX.exec(value);

  while (match) {
    const placeholder = match[1]?.trim();
    if (placeholder) {
      placeholders.add(placeholder);
    }
    match = PLACEHOLDER_REGEX.exec(value);
  }

  PLACEHOLDER_REGEX.lastIndex = 0;
  return Array.from(placeholders).sort().join("|");
};

const getPlaceholderTokensInOrder = (value: string) => {
  const tokens: string[] = [];
  let match = PLACEHOLDER_REGEX.exec(value);

  while (match) {
    const token = match[1]?.trim();
    if (token) {
      tokens.push(token);
    }
    match = PLACEHOLDER_REGEX.exec(value);
  }

  PLACEHOLDER_REGEX.lastIndex = 0;
  return tokens;
};

const normalizePlaceholderNames = (value: string, tokens: string[]) => {
  if (tokens.length === 0) {
    return value;
  }

  let index = 0;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, () => {
    const token = tokens[Math.min(index, tokens.length - 1)];
    index += 1;
    return `{${token}}`;
  });
};

const DEPRECATED_VALUE_PREFIX = "[DEPRECATED]";
type RiskLevel = "low" | "medium" | "high";

const RENAME_RISK_THRESHOLDS = {
  high: { usageCount: 20, fileCount: 10 },
  medium: { usageCount: 5, fileCount: 3 },
} as const;

const UNIFY_RISK_THRESHOLDS = {
  high: { usageCount: 30, fileCount: 10, keyCount: 8 },
  medium: { usageCount: 8, fileCount: 4, keyCount: 4 },
} as const;

const scoreMetric = (value: number, mediumThreshold: number, highThreshold: number) => {
  if (value <= 0) {
    return 0;
  }
  if (highThreshold <= mediumThreshold) {
    return value >= highThreshold ? 100 : 0;
  }
  if (value >= highThreshold) {
    return 100;
  }
  if (value >= mediumThreshold) {
    const ratio = (value - mediumThreshold) / (highThreshold - mediumThreshold);
    return Math.round(55 + ratio * 35);
  }
  return Math.round((value / mediumThreshold) * 50);
};

const EMPTY_TEXT_OPERATORS = new Set(["is_empty", "is_not_empty"]);

const createFilterRuleId = () => {
  return `filter-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
};

const createDefaultFilterRule = (): TableFilterRule => ({
  id: createFilterRuleId(),
  column: "key",
  operator: "contains",
  value: "",
});

const getColumnKind = (column: string): "text" | "number" | "status" => {
  if (column === "usage") {
    return "number";
  }
  if (column === "status") {
    return "status";
  }
  return "text";
};

type SearchDslFilter = {
  keyPattern: RegExp | null;
  locales: string[] | null;
  missing: boolean | null;
  usage: number | null;
  placeholderMismatch: boolean | null;
  changed: boolean | null;
  unused: boolean | null;
  terms: string[];
};

type MutableNamespaceNode = {
  id: string;
  label: string;
  keyCount: number;
  missingCount: number;
  unusedCount: number;
  children: Map<string, MutableNamespaceNode>;
};

const parseBooleanLiteral = (value: string): boolean | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return null;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compileGlobToRegExp = (pattern: string) => {
  const normalized = pattern.trim();
  if (!normalized) {
    return null;
  }
  const source =
    "^" +
    normalized
      .split("*")
      .map((segment) => escapeRegExp(segment))
      .join(".*") +
    "$";
  return new RegExp(source, "i");
};

const parseSearchDsl = (query: string, localeList: string[]): SearchDslFilter => {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const next: SearchDslFilter = {
    keyPattern: null,
    locales: null,
    missing: null,
    usage: null,
    placeholderMismatch: null,
    changed: null,
    unused: null,
    terms: [],
  };

  for (const token of tokens) {
    const separatorIndex = token.indexOf(":");
    if (separatorIndex === -1) {
      next.terms.push(token.toLowerCase());
      continue;
    }

    const rawName = token.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = token.slice(separatorIndex + 1).trim();
    if (!rawName || !rawValue) {
      next.terms.push(token.toLowerCase());
      continue;
    }

    if (rawName === "key") {
      next.keyPattern = compileGlobToRegExp(rawValue);
      continue;
    }

    if (rawName === "locale") {
      const requestedLocales = rawValue
        .split(",")
        .map((value) => value.trim())
        .filter((value) => localeList.includes(value));
      next.locales = requestedLocales.length > 0 ? requestedLocales : [];
      continue;
    }

    if (rawName === "missing") {
      next.missing = parseBooleanLiteral(rawValue);
      continue;
    }

    if (rawName === "placeholdermismatch") {
      next.placeholderMismatch = parseBooleanLiteral(rawValue);
      continue;
    }

    if (rawName === "changed") {
      next.changed = parseBooleanLiteral(rawValue);
      continue;
    }

    if (rawName === "unused") {
      next.unused = parseBooleanLiteral(rawValue);
      continue;
    }

    if (rawName === "usage") {
      const parsed = Number.parseInt(rawValue, 10);
      next.usage = Number.isNaN(parsed) ? null : parsed;
      continue;
    }

    next.terms.push(token.toLowerCase());
  }

  return next;
};

const getInvalidDotKeyReason = (value: string) => {
  if (value.startsWith(".") || value.endsWith(".")) {
    return "boundary_dot" as const;
  }
  if (value.includes("..")) {
    return "consecutive_dots" as const;
  }
  if (value.split(".").some((segment) => segment.trim() === "")) {
    return "empty_segment" as const;
  }
  return null;
};

const getTopLevelNamespace = (key: string) => {
  const [firstSegment] = key.split(".").filter(Boolean);
  return firstSegment || key;
};

const buildNamespaceTree = (
  keys: string[],
  locales: string[],
  data: FlatTranslationsByLocale,
  usage: UsageMap,
): NamespaceTreeNode[] => {
  const root = new Map<string, MutableNamespaceNode>();

  for (const key of keys) {
    const namespaceParts = key.split(".").filter(Boolean).slice(0, -1);
    if (namespaceParts.length === 0) {
      continue;
    }

    const missing = locales.some((locale) => isMissingValue(data[locale]?.[key] ?? ""));
    const unused = (usage[key]?.count ?? 0) === 0;
    let path = "";
    let cursor = root;

    for (const part of namespaceParts) {
      path = path ? `${path}.${part}` : part;
      if (!cursor.has(part)) {
        cursor.set(part, {
          id: path,
          label: part,
          keyCount: 0,
          missingCount: 0,
          unusedCount: 0,
          children: new Map<string, MutableNamespaceNode>(),
        });
      }

      const node = cursor.get(part)!;
      node.keyCount += 1;
      if (missing) {
        node.missingCount += 1;
      }
      if (unused) {
        node.unusedCount += 1;
      }
      cursor = node.children;
    }
  }

  const toTree = (source: Map<string, MutableNamespaceNode>): NamespaceTreeNode[] => {
    return Array.from(source.values())
      .sort((left, right) => left.label.localeCompare(right.label))
      .map((node) => ({
        id: node.id,
        label: node.label,
        keyCount: node.keyCount,
        missingCount: node.missingCount,
        unusedCount: node.unusedCount,
        children: toTree(node.children),
      }));
  };

  return toTree(root);
};

type UseTranslationsParams = {
  t: TranslateFn;
  dialog: DialogApi;
  onNotify?: (message: string) => void;
};

export function useTranslations({ t, dialog, onNotify }: UseTranslationsParams) {
  const [data, setData] = useState<FlatTranslationsByLocale>({});
  const [baselineData, setBaselineData] = useState<FlatTranslationsByLocale>({});
  const [configuredDefaultLocale, setConfiguredDefaultLocale] = useState("en");
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [staleData, setStaleData] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    "maintenance",
  );
  const [filterValue, setFilterValue] = useState("");
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [filterRules, setFilterRules] = useState<TableFilterRule[]>([]);
  const [sortConfig, setSortConfig] = useState<TableSortConfig | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newKeyError, setNewKeyError] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageMap>({});
  const [usagePages, setUsagePages] = useState<KeyUsagePage[]>([]);
  const [fileUsages, setFileUsages] = useState<KeyUsageFile[]>([]);
  const [gitBaseRef, setGitBaseRef] = useState("origin/main");
  const [gitDiffAvailable, setGitDiffAvailable] = useState(true);
  const [gitDiffError, setGitDiffError] = useState<string | null>(null);
  const [gitDiffByKey, setGitDiffByKey] = useState<Record<string, GitKeyDiff>>({});
  const [showOnlyGitChanged, setShowOnlyGitChanged] = useState(false);
  const [hardcodedTextCount, setHardcodedTextCount] = useState(0);
  const [hardcodedTextPreview, setHardcodedTextPreview] = useState<string[]>([]);
  const [hardcodedTextIssues, setHardcodedTextIssues] = useState<
    HardcodedTextIssue[]
  >([]);
  const [issueBaseline, setIssueBaseline] = useState<IssueBaselineReport | null>(
    null,
  );
  const [selectedPage, setSelectedPage] = useState("all");
  const [selectedFile, setSelectedFile] = useState("all");
  const [selectedNamespace, setSelectedNamespace] = useState("all");
  const [groupByNamespace, setGroupByNamespace] = useState(false);
  const [collapsedNamespaceGroups, setCollapsedNamespaceGroups] = useState<string[]>(
    [],
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const translateRef = useRef<TranslateFn>(t);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedMode = window.localStorage.getItem("gloss-workspace-mode");
    if (storedMode === "translate" || storedMode === "maintenance") {
      setWorkspaceMode(storedMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("gloss-workspace-mode", workspaceMode);
  }, [workspaceMode]);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/config");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { defaultLocale?: unknown };
      const nextDefaultLocale =
        typeof payload.defaultLocale === "string" ? payload.defaultLocale.trim() : "";
      if (nextDefaultLocale) {
        setConfiguredDefaultLocale(nextDefaultLocale);
      }
    } catch {
      return;
    }
  }, []);

  const loadKeyUsage = useCallback(async () => {
    try {
      const response = await fetch("/api/key-usage");
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (!payload || typeof payload !== "object") {
        setUsagePages([]);
        setFileUsages([]);
        return;
      }

      const source =
        Array.isArray(payload) ?
          { pages: [] as unknown[], files: payload }
        : (payload as { pages?: unknown; files?: unknown });
      const pages = parseUsageEntries(source.pages);
      const files = (() => {
        const parsedFiles = parseUsageEntries(source.files);
        if (parsedFiles.length > 0) {
          return parsedFiles;
        }
        return parseUsageEntries(source.pages);
      })();

      setUsagePages(pages);
      setFileUsages(files);
    } catch {
      setUsagePages([]);
      setFileUsages([]);
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const response = await fetch("/api/usage");
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return;
      }

      const nextUsage: UsageMap = {};

      for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
        if (!value || typeof value !== "object") {
          continue;
        }

        const entry = value as { count?: unknown; files?: unknown };
        const count =
          typeof entry.count === "number" && Number.isFinite(entry.count)
            ? entry.count
            : 0;
        const files = Array.isArray(entry.files)
          ? Array.from(
              new Set(
                entry.files.filter(
                  (file): file is string => typeof file === "string" && file.trim() !== "",
                ),
              ),
            )
          : [];

        nextUsage[key] = { count, files };
      }

      setUsage(nextUsage);
    } catch {
      return;
    }
  }, []);

  const loadGitDiff = useCallback(async () => {
    try {
      const query = new URLSearchParams({ base: gitBaseRef }).toString();
      const response = await fetch(`/api/git-diff?${query}`);
      if (!response.ok) {
        setGitDiffAvailable(false);
        setGitDiffError(t("gitDiffUnavailable"));
        setGitDiffByKey({});
        return;
      }

      const payload = (await response.json()) as {
        available?: unknown;
        error?: unknown;
        keys?: unknown;
      };
      const available = payload.available !== false;

      if (!available) {
        setGitDiffAvailable(false);
        setGitDiffError(
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : t("gitDiffUnavailable"),
        );
        setGitDiffByKey({});
        return;
      }

      const entries = parseGitDiffEntries(payload.keys);
      const nextByKey: Record<string, GitKeyDiff> = {};
      for (const entry of entries) {
        nextByKey[entry.key] = entry;
      }

      setGitDiffAvailable(true);
      setGitDiffError(null);
      setGitDiffByKey(nextByKey);
    } catch {
      setGitDiffAvailable(false);
      setGitDiffError(t("gitDiffUnavailable"));
      setGitDiffByKey({});
    }
  }, [gitBaseRef, t]);

  const loadCheckSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/check?summary=1");
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        summary?: { hardcodedTexts?: unknown };
        hardcodedTexts?: unknown;
        baseline?: unknown;
      };
      const issues = Array.isArray(payload.hardcodedTexts)
        ? payload.hardcodedTexts
            .map((entry) => {
              const value = entry as Partial<HardcodedTextIssue>;
              if (
                typeof value.file !== "string" ||
                typeof value.line !== "number" ||
                typeof value.text !== "string"
              ) {
                return null;
              }

              const kind =
                value.kind === "jsx_text" || value.kind === "jsx_attribute"
                  ? value.kind
                  : "jsx_text";
              return {
                file: value.file,
                line: value.line,
                text: value.text,
                kind,
              } as HardcodedTextIssue;
            })
            .filter(
              (issue): issue is HardcodedTextIssue => issue !== null,
            )
        : [];
      const previewEntries = issues.map(
        (issue) => `${issue.file}:${issue.line} [${issue.kind}] ${issue.text}`,
      );
      const count =
        typeof payload.summary?.hardcodedTexts === "number"
          ? payload.summary.hardcodedTexts
          : issues.length;

      setHardcodedTextCount(count);
      setHardcodedTextPreview(previewEntries);
      setHardcodedTextIssues(issues);
      setIssueBaseline(parseIssueBaselineReport(payload.baseline));
    } catch {
      return;
    }
  }, []);

  const validateDotKey = useCallback(
    (value: string): string | null => {
      const key = value.trim();

      if (!key) return t("keyRequired");
      const invalidReason = getInvalidDotKeyReason(key);
      if (invalidReason === "boundary_dot") {
        return t("keyBoundaryDot");
      }
      if (invalidReason === "consecutive_dots") {
        return t("keyConsecutiveDots");
      }
      if (invalidReason === "empty_segment") {
        return t("keyEmptySegment");
      }

      return null;
    },
    [t],
  );

  const loadTranslations = useCallback(async () => {
    setLoading(true);
    setLoadingError(null);

    try {
      const response = await fetch("/api/translations");
      if (!response.ok) {
        throw new Error(String(response.status));
      }

      const json = (await response.json()) as Record<string, TranslationTree>;
      const flattened = flattenTranslations(json);
      const next = cloneTranslations(flattened);

      setData(next);
      setBaselineData(cloneTranslations(next));
      setStaleData(false);
      setSaveError(null);
      void loadCheckSummary();
    } catch (error) {
      const status =
        error instanceof Error && !Number.isNaN(Number(error.message))
          ? Number(error.message)
          : undefined;
      setLoadingError(
        status === undefined
          ? translateRef.current("loadFailed")
          : translateRef.current("loadFailedWithStatus", { status }),
      );
    } finally {
      setLoading(false);
    }
  }, [loadCheckSummary]);

  useEffect(() => {
    void loadTranslations();
  }, [loadTranslations]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    void loadKeyUsage();
  }, [loadKeyUsage]);

  useEffect(() => {
    void loadGitDiff();
  }, [loadGitDiff]);

  useEffect(() => {
    void loadCheckSummary();
  }, [loadCheckSummary]);

  const locales = Object.keys(data);
  const defaultLocale = useMemo(() => {
    if (configuredDefaultLocale && locales.includes(configuredDefaultLocale)) {
      return configuredDefaultLocale;
    }
    if (locales.includes("en")) {
      return "en";
    }
    return locales[0] ?? "";
  }, [configuredDefaultLocale, locales]);
  const allKeys = useMemo(() => {
    const keySet = new Set<string>();

    for (const locale of locales) {
      for (const key of Object.keys(data[locale] ?? {})) {
        keySet.add(key);
      }
    }

    for (const key of Object.keys(usage)) {
      keySet.add(key);
    }

    for (const page of usagePages) {
      for (const key of page.keys) {
        keySet.add(key);
      }
    }

    for (const fileUsage of fileUsages) {
      for (const key of fileUsage.keys) {
        keySet.add(key);
      }
    }

    return Array.from(keySet).sort();
  }, [data, fileUsages, locales, usage, usagePages]);
  const { groups: duplicateValueGroups } = useDuplicateValues(data);
  const searchDsl = useMemo(() => parseSearchDsl(filterValue, locales), [filterValue, locales]);
  const placeholderMismatchByKey = useMemo(() => {
    const mismatches = new Set<string>();

    for (const key of allKeys) {
      const signatures = new Set<string>();

      for (const locale of locales) {
        const value = data[locale]?.[key] ?? "";
        if (value.trim() === "") {
          continue;
        }

        signatures.add(placeholderSignature(value));
      }

      if (signatures.size > 1) {
        mismatches.add(key);
      }
    }

    return mismatches;
  }, [allKeys, data, locales]);
  const issuesInboxItems = useMemo(() => {
    const items: IssuesInboxItem[] = [];
    const valueToKeys = new Map<string, Set<string>>();

    for (const key of allKeys) {
      for (const locale of locales) {
        const value = (data[locale]?.[key] ?? "").trim();
        if (!value) {
          continue;
        }
        const keysForValue = valueToKeys.get(value) ?? new Set<string>();
        keysForValue.add(key);
        valueToKeys.set(value, keysForValue);
      }

      const missingLocales = locales.filter((locale) =>
        isMissingValue(data[locale]?.[key] ?? ""),
      );
      if (missingLocales.length > 0) {
        items.push({
          id: `missing:${key}`,
          type: "missing",
          key,
          missingLocales,
        });
      }

      if ((usage[key]?.count ?? 0) === 0) {
        items.push({
          id: `unused:${key}`,
          type: "unused",
          key,
        });
      }

      if (placeholderMismatchByKey.has(key)) {
        items.push({
          id: `placeholder:${key}`,
          type: "placeholder_mismatch",
          key,
        });
      }

      const invalidReason = getInvalidDotKeyReason(key.trim());
      if (invalidReason) {
        items.push({
          id: `invalid:${key}`,
          type: "invalid_key",
          key,
          invalidReason,
        });
      }
    }

    for (const issue of hardcodedTextIssues) {
      const hardcodedValue = issue.text.trim();
      const matchedKeys = hardcodedValue ? valueToKeys.get(hardcodedValue) : undefined;
      const matchedKey =
        matchedKeys && matchedKeys.size === 1
          ? Array.from(matchedKeys)[0]
          : undefined;

      items.push({
        id: `hardcoded:${issue.file}:${issue.line}:${issue.kind}:${issue.text}`,
        type: "hardcoded_text",
        key: matchedKey,
        file: issue.file,
        line: issue.line,
        text: issue.text,
      });
    }

    return items;
  }, [allKeys, data, hardcodedTextIssues, locales, placeholderMismatchByKey, usage]);
  const namespaceTree = useMemo(
    () => buildNamespaceTree(allKeys, locales, data, usage),
    [allKeys, data, locales, usage],
  );
  const namespaceIdSet = useMemo(() => {
    const ids = new Set<string>();
    const visit = (nodes: NamespaceTreeNode[]) => {
      for (const node of nodes) {
        ids.add(node.id);
        visit(node.children);
      }
    };

    visit(namespaceTree);
    return ids;
  }, [namespaceTree]);
  const gitChangedKeySet = useMemo(
    () => new Set(Object.keys(gitDiffByKey)),
    [gitDiffByKey],
  );
  const unsavedChangedKeySet = useMemo(() => {
    const keySet = new Set<string>();
    for (const locale of locales) {
      const localeData = data[locale] ?? {};
      const localeBaseline = baselineData[locale] ?? {};
      const localeKeys = new Set([
        ...Object.keys(localeData),
        ...Object.keys(localeBaseline),
      ]);

      for (const key of localeKeys) {
        if ((localeData[key] ?? "") !== (localeBaseline[key] ?? "")) {
          keySet.add(key);
        }
      }
    }

    return keySet;
  }, [baselineData, data, locales]);
  const changedSinceBaseKeySet = useMemo(() => {
    const merged = new Set(gitChangedKeySet);
    for (const key of unsavedChangedKeySet) {
      merged.add(key);
    }
    return merged;
  }, [gitChangedKeySet, unsavedChangedKeySet]);

  const currentSnapshot = useMemo(() => serializeTranslations(data), [data]);
  const baselineSnapshot = useMemo(
    () => serializeTranslations(baselineData),
    [baselineData],
  );
  const hasUnsavedChanges = currentSnapshot !== baselineSnapshot;

  const isRowMissing = useCallback(
    (key: string) => {
      return locales.some((locale) => isMissingValue(data[locale]?.[key] ?? ""));
    },
    [data, locales],
  );

  const isCellDirty = useCallback(
    (locale: string, key: string) => {
      return (data[locale]?.[key] ?? "") !== (baselineData[locale]?.[key] ?? "");
    },
    [baselineData, data],
  );

  const getTranslatedCountForKey = useCallback(
    (key: string) => {
      return locales.reduce((count, locale) => {
        return count + (isMissingValue(data[locale]?.[key] ?? "") ? 0 : 1);
      }, 0);
    },
    [data, locales],
  );

  const buildKeyDiagnosticsLines = useCallback(
    (key: string) => {
      const lines: string[] = [t("diagnosticsLabel")];
      const usageEntry = usage[key];
      const usageCount = usageEntry?.count ?? 0;
      const files = usageEntry?.files ?? [];
      const missingLocales = locales.filter((locale) =>
        isMissingValue(data[locale]?.[key] ?? ""),
      );
      const changedLocales = locales.filter((locale) =>
        (data[locale]?.[key] ?? "") !== (baselineData[locale]?.[key] ?? ""),
      );

      lines.push(`- ${t("diagnosticsUsage", { count: usageCount })}`);
      lines.push(`- ${t("diagnosticsFiles", { count: files.length })}`);

      if (missingLocales.length > 0) {
        lines.push(
          `- ${t("diagnosticsMissingLocales", {
            locales: missingLocales.join(", "),
          })}`,
        );
      }

      if (changedLocales.length > 0) {
        lines.push(
          `- ${t("diagnosticsChangedLocales", {
            locales: changedLocales.join(", "),
          })}`,
        );
      }

      if (placeholderMismatchByKey.has(key)) {
        lines.push(`- ${t("diagnosticsPlaceholderMismatch")}`);
      }

      if (getInvalidDotKeyReason(key.trim())) {
        lines.push(`- ${t("diagnosticsInvalidKey")}`);
      }

      return lines.join("\n");
    },
    [baselineData, data, locales, placeholderMismatchByKey, t, usage],
  );

  const riskLevelLabel = useCallback(
    (level: RiskLevel) => {
      if (level === "high") {
        return t("riskLevelHigh");
      }
      if (level === "medium") {
        return t("riskLevelMedium");
      }
      return t("riskLevelLow");
    },
    [t],
  );

  const getRenameRiskLevel = useCallback((usageCount: number, fileCount: number): RiskLevel => {
    if (
      usageCount >= RENAME_RISK_THRESHOLDS.high.usageCount ||
      fileCount >= RENAME_RISK_THRESHOLDS.high.fileCount
    ) {
      return "high";
    }
    if (
      usageCount >= RENAME_RISK_THRESHOLDS.medium.usageCount ||
      fileCount >= RENAME_RISK_THRESHOLDS.medium.fileCount
    ) {
      return "medium";
    }
    return "low";
  }, []);

  const getUnifyRiskLevel = useCallback(
    (usageCount: number, fileCount: number, keyCount: number): RiskLevel => {
      if (
        usageCount >= UNIFY_RISK_THRESHOLDS.high.usageCount ||
        fileCount >= UNIFY_RISK_THRESHOLDS.high.fileCount ||
        keyCount >= UNIFY_RISK_THRESHOLDS.high.keyCount
      ) {
        return "high";
      }
      if (
        usageCount >= UNIFY_RISK_THRESHOLDS.medium.usageCount ||
        fileCount >= UNIFY_RISK_THRESHOLDS.medium.fileCount ||
        keyCount >= UNIFY_RISK_THRESHOLDS.medium.keyCount
      ) {
        return "medium";
      }
      return "low";
    },
    [],
  );

  const getRenameRiskScore = useCallback((usageCount: number, fileCount: number) => {
    const usageScore = scoreMetric(
      usageCount,
      RENAME_RISK_THRESHOLDS.medium.usageCount,
      RENAME_RISK_THRESHOLDS.high.usageCount,
    );
    const fileScore = scoreMetric(
      fileCount,
      RENAME_RISK_THRESHOLDS.medium.fileCount,
      RENAME_RISK_THRESHOLDS.high.fileCount,
    );
    return Math.max(usageScore, fileScore);
  }, []);

  const getUnifyRiskScore = useCallback(
    (usageCount: number, fileCount: number, keyCount: number) => {
      const usageScore = scoreMetric(
        usageCount,
        UNIFY_RISK_THRESHOLDS.medium.usageCount,
        UNIFY_RISK_THRESHOLDS.high.usageCount,
      );
      const fileScore = scoreMetric(
        fileCount,
        UNIFY_RISK_THRESHOLDS.medium.fileCount,
        UNIFY_RISK_THRESHOLDS.high.fileCount,
      );
      const keyScore = scoreMetric(
        keyCount,
        UNIFY_RISK_THRESHOLDS.medium.keyCount,
        UNIFY_RISK_THRESHOLDS.high.keyCount,
      );
      return Math.max(usageScore, fileScore, keyScore);
    },
    [],
  );

  const buildRenameRiskPreview = useCallback(
    (oldKey: string, newKey: string) => {
      const usageCount = usage[oldKey]?.count ?? 0;
      const usageFiles = usage[oldKey]?.files ?? [];
      const affectedLocales = locales.length;
      const level = getRenameRiskLevel(usageCount, usageFiles.length);
      const score = getRenameRiskScore(usageCount, usageFiles.length);

      const lines = [
        t("riskPreviewTitle"),
        t("riskRenameSummary", { oldKey, newKey }),
        t("riskLevelLabel", { level: riskLevelLabel(level) }),
        t("riskScoreLabel", { score }),
        t("riskAffectedLocales", { count: affectedLocales }),
        t("riskUsageOccurrences", { count: usageCount }),
        t("riskUsageFiles", { count: usageFiles.length }),
      ];

      return {
        level,
        score,
        message: lines.join("\n"),
      };
    },
    [getRenameRiskLevel, getRenameRiskScore, locales.length, riskLevelLabel, t, usage],
  );

  const buildUnifyRiskPreview = useCallback(
    (group: DuplicateValueGroup, newKey: string, deleteOldKeys: boolean) => {
      const affectedKeys = group.keys.filter((key) => key !== newKey);
      const usageCount = affectedKeys.reduce((total, key) => total + (usage[key]?.count ?? 0), 0);
      const usageFiles = new Set(
        affectedKeys.flatMap((key) => usage[key]?.files ?? []),
      );
      const level = getUnifyRiskLevel(
        usageCount,
        usageFiles.size,
        affectedKeys.length,
      );
      const score = getUnifyRiskScore(
        usageCount,
        usageFiles.size,
        affectedKeys.length,
      );
      const mode = deleteOldKeys ? t("riskUnifyModeDelete") : t("riskUnifyModeReference");

      const lines = [
        t("riskPreviewTitle"),
        t("riskUnifySummary", {
          count: affectedKeys.length,
          newKey,
        }),
        t("riskLevelLabel", { level: riskLevelLabel(level) }),
        t("riskScoreLabel", { score }),
        t("riskUnifyMode", { mode }),
        t("riskAffectedLocales", { count: locales.length }),
        t("riskAffectedKeys", { count: affectedKeys.length }),
        t("riskUsageOccurrences", { count: usageCount }),
        t("riskUsageFiles", { count: usageFiles.size }),
      ];

      return {
        level,
        score,
        message: lines.join("\n"),
      };
    },
    [getUnifyRiskLevel, getUnifyRiskScore, locales.length, riskLevelLabel, t, usage],
  );

  const getStatusTokensForKey = useCallback(
    (key: string) => {
      const tokens = new Set<string>();
      const translatedCount = getTranslatedCountForKey(key);

      if (translatedCount === 0) {
        tokens.add("untranslated");
      } else if (translatedCount === locales.length) {
        tokens.add("complete");
      } else {
        tokens.add("partial");
      }

      if (translatedCount < locales.length) {
        tokens.add("missing");
      }

      if ((usage[key]?.count ?? 0) === 0) {
        tokens.add("unused");
      } else {
        tokens.add("used");
      }

      return tokens;
    },
    [getTranslatedCountForKey, locales.length, usage],
  );

  const matchesFilterRule = useCallback(
    (key: string, rule: TableFilterRule) => {
      const columnKind = getColumnKind(rule.column);

      if (columnKind === "number") {
        const numericValue = Number.parseFloat(rule.value.trim());
        if (Number.isNaN(numericValue)) {
          return false;
        }

        const usageCount = usage[key]?.count ?? 0;
        if (rule.operator === "eq") return usageCount === numericValue;
        if (rule.operator === "neq") return usageCount !== numericValue;
        if (rule.operator === "gt") return usageCount > numericValue;
        if (rule.operator === "gte") return usageCount >= numericValue;
        if (rule.operator === "lt") return usageCount < numericValue;
        if (rule.operator === "lte") return usageCount <= numericValue;
        return true;
      }

      if (columnKind === "status") {
        const tokens = getStatusTokensForKey(key);
        if (rule.operator === "is") {
          return tokens.has(rule.value);
        }
        if (rule.operator === "is_not") {
          return !tokens.has(rule.value);
        }
        return true;
      }

      const columnText =
        rule.column === "key" ? key
        : rule.column.startsWith("locale:") ?
          (data[rule.column.replace("locale:", "")]?.[key] ?? "")
        : key;
      const text = columnText.toLowerCase();
      const query = rule.value.toLowerCase().trim();

      if (rule.operator === "is_empty") {
        return text.trim() === "";
      }
      if (rule.operator === "is_not_empty") {
        return text.trim() !== "";
      }

      if (!query) {
        return true;
      }
      if (rule.operator === "contains") return text.includes(query);
      if (rule.operator === "not_contains") return !text.includes(query);
      if (rule.operator === "equals") return text === query;
      if (rule.operator === "not_equals") return text !== query;
      if (rule.operator === "starts_with") return text.startsWith(query);
      if (rule.operator === "ends_with") return text.endsWith(query);
      return true;
    },
    [data, getStatusTokensForKey, usage],
  );

  const keys = allKeys.filter((key) => {
    if (showOnlyGitChanged && !changedSinceBaseKeySet.has(key)) {
      return false;
    }

    if (showOnlyMissing && !isRowMissing(key)) {
      return false;
    }

    if (selectedNamespace !== "all") {
      const namespacePrefix = `${selectedNamespace}.`;
      if (key !== selectedNamespace && !key.startsWith(namespacePrefix)) {
        return false;
      }
    }

    const keyText = key.toLowerCase();
    for (const term of searchDsl.terms) {
      if (!keyText.includes(term)) {
        return false;
      }
    }

    if (searchDsl.keyPattern && !searchDsl.keyPattern.test(key)) {
      return false;
    }

    const usageCount = usage[key]?.count ?? 0;
    if (searchDsl.usage !== null && usageCount !== searchDsl.usage) {
      return false;
    }

    if (searchDsl.unused !== null) {
      const isUnused = usageCount === 0;
      if (searchDsl.unused !== isUnused) {
        return false;
      }
    }

    if (searchDsl.changed !== null) {
      const isChanged = changedSinceBaseKeySet.has(key);
      if (searchDsl.changed !== isChanged) {
        return false;
      }
    }

    if (searchDsl.placeholderMismatch !== null) {
      const hasPlaceholderMismatch = placeholderMismatchByKey.has(key);
      if (searchDsl.placeholderMismatch !== hasPlaceholderMismatch) {
        return false;
      }
    }

    if (searchDsl.missing !== null) {
      const localesToCheck =
        searchDsl.locales && searchDsl.locales.length > 0
          ? searchDsl.locales
          : locales;
      const hasMissing = localesToCheck.some((locale) =>
        isMissingValue(data[locale]?.[key] ?? ""),
      );
      if (searchDsl.missing !== hasMissing) {
        return false;
      }
    }

    for (const rule of filterRules) {
      if (EMPTY_TEXT_OPERATORS.has(rule.operator)) {
        if (!matchesFilterRule(key, rule)) {
          return false;
        }
        continue;
      }

      if (rule.value.trim() === "" && getColumnKind(rule.column) !== "status") {
        continue;
      }

      if (!matchesFilterRule(key, rule)) {
        return false;
      }
    }

    return true;
  });

  const selectedUsagePage = useMemo(() => {
    if (selectedPage === "all") {
      return null;
    }

    return usagePages.find((page) => page.id === selectedPage) ?? null;
  }, [selectedPage, usagePages]);

  const selectedPageKeys = useMemo(() => {
    if (!selectedUsagePage) {
      return null;
    }

    return new Set(selectedUsagePage.keys);
  }, [selectedUsagePage]);

  const selectedUsageFile = useMemo(() => {
    if (selectedFile === "all") {
      return null;
    }

    return fileUsages.find((fileUsage) => fileUsage.id === selectedFile) ?? null;
  }, [fileUsages, selectedFile]);

  const selectedFileKeySet = useMemo(() => {
    if (!selectedUsageFile) {
      return null;
    }

    return new Set(selectedUsageFile.keys);
  }, [selectedUsageFile]);

  const filteredBySelectionKeys = keys.filter((key) => {
    if (selectedPageKeys && !selectedPageKeys.has(key)) {
      return false;
    }
    if (selectedFileKeySet && !selectedFileKeySet.has(key)) {
      return false;
    }
    return true;
  });

  const orderedVisibleKeys = useMemo(() => {
    const next = [...filteredBySelectionKeys];

    if (!sortConfig) {
      return next;
    }

    const { column, direction } = sortConfig;
    const multiplier = direction === "asc" ? 1 : -1;

    next.sort((leftKey, rightKey) => {
      const columnKind = getColumnKind(column);

      if (columnKind === "number") {
        const leftUsage = usage[leftKey]?.count ?? 0;
        const rightUsage = usage[rightKey]?.count ?? 0;
        if (leftUsage !== rightUsage) {
          return (leftUsage - rightUsage) * multiplier;
        }
        return leftKey.localeCompare(rightKey);
      }

      if (columnKind === "status") {
        const leftTranslated = getTranslatedCountForKey(leftKey);
        const rightTranslated = getTranslatedCountForKey(rightKey);
        if (leftTranslated !== rightTranslated) {
          return (leftTranslated - rightTranslated) * multiplier;
        }

        const leftUsage = usage[leftKey]?.count ?? 0;
        const rightUsage = usage[rightKey]?.count ?? 0;
        if (leftUsage !== rightUsage) {
          return (leftUsage - rightUsage) * multiplier;
        }
        return leftKey.localeCompare(rightKey);
      }

      const leftValue =
        column === "key" ? leftKey
        : column.startsWith("locale:") ?
          (data[column.replace("locale:", "")]?.[leftKey] ?? "")
        : leftKey;
      const rightValue =
        column === "key" ? rightKey
        : column.startsWith("locale:") ?
          (data[column.replace("locale:", "")]?.[rightKey] ?? "")
        : rightKey;

      const comparison = leftValue.localeCompare(rightValue, undefined, {
        sensitivity: "base",
        numeric: true,
      });
      if (comparison !== 0) {
        return comparison * multiplier;
      }
      return leftKey.localeCompare(rightKey);
    });

    return next;
  }, [data, filteredBySelectionKeys, getTranslatedCountForKey, sortConfig, usage]);

  const namespaceTableGroups = useMemo<NamespaceTableGroup[]>(() => {
    const groups = new Map<string, NamespaceTableGroup>();

    for (const key of orderedVisibleKeys) {
      const namespaceId = getTopLevelNamespace(key);
      const existing = groups.get(namespaceId);
      if (existing) {
        existing.keys.push(key);
        continue;
      }

      groups.set(namespaceId, {
        id: namespaceId,
        label: namespaceId,
        keys: [key],
      });
    }

    return Array.from(groups.values());
  }, [orderedVisibleKeys]);

  const collapsedNamespaceGroupSet = useMemo(
    () => new Set(collapsedNamespaceGroups),
    [collapsedNamespaceGroups],
  );

  const visibleKeys = useMemo(() => {
    if (!groupByNamespace || collapsedNamespaceGroupSet.size === 0) {
      return orderedVisibleKeys;
    }

    return orderedVisibleKeys.filter(
      (key) => !collapsedNamespaceGroupSet.has(getTopLevelNamespace(key)),
    );
  }, [collapsedNamespaceGroupSet, groupByNamespace, orderedVisibleKeys]);

  useEffect(() => {
    if (selectedPage === "all") {
      return;
    }

    if (!usagePages.some((page) => page.id === selectedPage)) {
      setSelectedPage("all");
    }
  }, [selectedPage, usagePages]);

  useEffect(() => {
    if (selectedFile === "all") {
      return;
    }

    if (!fileUsages.some((fileUsage) => fileUsage.id === selectedFile)) {
      setSelectedFile("all");
    }
  }, [fileUsages, selectedFile]);

  useEffect(() => {
    if (selectedNamespace === "all") {
      return;
    }

    if (!namespaceIdSet.has(selectedNamespace)) {
      setSelectedNamespace("all");
    }
  }, [namespaceIdSet, selectedNamespace]);

  useEffect(() => {
    const availableGroups = new Set(namespaceTableGroups.map((group) => group.id));
    setCollapsedNamespaceGroups((prev) => {
      const next = prev.filter((groupId) => availableGroups.has(groupId));
      return next.length === prev.length ? prev : next;
    });
  }, [namespaceTableGroups]);

  useEffect(() => {
    if (workspaceMode !== "translate") {
      return;
    }

    setShowOnlyGitChanged(false);
    setSelectedPage("all");
    setSelectedFile("all");
    setSelectedNamespace("all");
    setExpandedKey(null);
    setRenamingKey(null);
    setRenameValue("");
    setRenameError(null);
  }, [workspaceMode]);

  useEffect(() => {
    const localeSet = new Set(locales);

    setFilterRules((prev) => {
      const next = prev.filter((rule) => {
        if (!rule.column.startsWith("locale:")) {
          return true;
        }
        const locale = rule.column.replace("locale:", "");
        return localeSet.has(locale);
      });

      return next.length === prev.length ? prev : next;
    });

    setSortConfig((prev) => {
      if (!prev || !prev.column.startsWith("locale:")) {
        return prev;
      }
      const locale = prev.column.replace("locale:", "");
      if (localeSet.has(locale)) {
        return prev;
      }
      return null;
    });
  }, [locales]);

  useEffect(() => {
    if (expandedKey && !visibleKeys.includes(expandedKey)) {
      setExpandedKey(null);
    }
  }, [expandedKey, visibleKeys]);

  const textareaRows = (value: string) => {
    const lineCount = value.split("\n").length;
    const wrapCount = Math.ceil(value.length / 60) || 1;
    return Math.min(3, Math.max(1, Math.max(lineCount, wrapCount)));
  };

  const hasMissingInView = visibleKeys.some((key) => isRowMissing(key));
  const translatedRowsCount = allKeys.reduce((count, key) => {
    return count + (isRowMissing(key) ? 0 : 1);
  }, 0);
  const totalMissingCells = allKeys.reduce((count, key) => {
    return (
      count +
      locales.reduce((localeCount, locale) => {
        return localeCount + (isMissingValue(data[locale]?.[key] ?? "") ? 1 : 0);
      }, 0)
    );
  }, 0);
  const unsavedChangedKeyCount = unsavedChangedKeySet.size;
  const changedSinceBaseKeyCount = changedSinceBaseKeySet.size;

  const handleChange = useCallback((locale: string, key: string, value: string) => {
    setSaveError(null);
    setStaleData(false);
    setData((prev) => ({
      ...prev,
      [locale]: {
        ...(prev[locale] ?? {}),
        [key]: value,
      },
    }));
  }, []);

  const addFilterRule = useCallback(() => {
    setFilterRules((prev) => [...prev, createDefaultFilterRule()]);
  }, []);

  const updateFilterRule = useCallback(
    (ruleId: string, patch: Partial<Omit<TableFilterRule, "id">>) => {
      setFilterRules((prev) =>
        prev.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
      );
    },
    [],
  );

  const removeFilterRule = useCallback((ruleId: string) => {
    setFilterRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  }, []);

  const clearFilterRules = useCallback(() => {
    setFilterRules([]);
  }, []);

  const updateSortConfig = useCallback((patch: Partial<TableSortConfig>) => {
    setSortConfig((prev) => ({
      column: patch.column ?? prev?.column ?? "key",
      direction: patch.direction ?? prev?.direction ?? "asc",
    }));
  }, []);

  const clearSort = useCallback(() => {
    setSortConfig(null);
  }, []);

  const updateNewKey = useCallback((value: string) => {
    setNewKey(value);
    setNewKeyError(null);
  }, []);

  const addKey = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmedKey = newKey.trim();

      if (locales.length === 0) {
        return;
      }

      const validationError = validateDotKey(trimmedKey);
      if (validationError) {
        setNewKeyError(validationError);
        return;
      }
      if (allKeys.includes(trimmedKey)) {
        setNewKeyError(t("keyExists"));
        return;
      }

      setSaveError(null);
      setNewKeyError(null);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };

        for (const locale of locales) {
          next[locale] = {
            ...(next[locale] ?? {}),
            [trimmedKey]: next[locale]?.[trimmedKey] ?? "",
          };
        }

        return next;
      });

      setNewKey("");
    },
    [allKeys, locales, newKey, t, validateDotKey],
  );

  const startRename = useCallback((key: string) => {
    setRenamingKey(key);
    setRenameValue(key);
    setRenameError(null);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingKey(null);
    setRenameValue("");
    setRenameError(null);
  }, []);

  const updateRenameValue = useCallback((value: string) => {
    setRenameValue(value);
    setRenameError(null);
  }, []);

  const applyRename = useCallback(
    async (oldKey: string) => {
      const trimmedKey = renameValue.trim();
      const validationError = validateDotKey(trimmedKey);

      if (validationError) {
        setRenameError(validationError);
        return;
      }

      if (trimmedKey !== oldKey && allKeys.includes(trimmedKey)) {
        setRenameError(t("keyExists"));
        return;
      }

      if (trimmedKey === oldKey) {
        cancelRename();
        return;
      }

      const renameRiskPreview = buildRenameRiskPreview(oldKey, trimmedKey);
      const shouldRename = await dialog.confirm(
        `${t("renameKeyConfirm", { oldKey, newKey: trimmedKey })}\n\n${renameRiskPreview.message}\n\n${buildKeyDiagnosticsLines(oldKey)}`,
        {
          confirmLabel: t("apply"),
          cancelLabel: t("cancel"),
          tone: renameRiskPreview.level === "high" ? "danger" : "primary",
        },
      );
      if (!shouldRename) {
        return;
      }

      try {
        const response = await fetch("/api/rename-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldKey, newKey: trimmedKey }),
        });

        if (!response.ok) {
          throw new Error(String(response.status));
        }
      } catch (error) {
        const status =
          error instanceof Error && !Number.isNaN(Number(error.message))
            ? Number(error.message)
            : undefined;
        setSaveError(
          status === undefined
            ? t("renameRefactorFailed")
            : t("renameRefactorFailedWithStatus", { status }),
        );
        return;
      }

      setSaveError(null);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };

        for (const locale of locales) {
          const localeData = { ...(next[locale] ?? {}) };
          const oldValue = localeData[oldKey] ?? "";
          delete localeData[oldKey];
          localeData[trimmedKey] = oldValue;
          next[locale] = localeData;
        }

        return next;
      });

      cancelRename();
      void loadUsage();
      void loadKeyUsage();
    },
    [
      allKeys,
      buildKeyDiagnosticsLines,
      cancelRename,
      dialog,
      loadKeyUsage,
      loadUsage,
      locales,
      buildRenameRiskPreview,
      renameValue,
      t,
      validateDotKey,
    ],
  );

  const deleteKey = useCallback(
    async (key: string) => {
      const shouldDelete = await dialog.confirm(
        `${t("deleteKeyConfirm", { key })}\n\n${buildKeyDiagnosticsLines(key)}`,
        {
          confirmLabel: t("delete"),
          cancelLabel: t("cancel"),
          tone: "danger",
        },
      );
      if (!shouldDelete) {
        return;
      }

      setSaveError(null);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };

        for (const locale of locales) {
          const localeData = { ...(next[locale] ?? {}) };
          delete localeData[key];
          next[locale] = localeData;
        }

        return next;
      });

      if (renamingKey === key) {
        cancelRename();
      }

      onNotify?.(t("deleteKeySuccess", { key }));
    },
    [buildKeyDiagnosticsLines, cancelRename, dialog, locales, onNotify, renamingKey, t],
  );

  const fillMissingFromDefaultLocale = useCallback(
    (key: string) => {
      if (!defaultLocale || locales.length === 0) {
        return;
      }

      const fallbackValue =
        data[defaultLocale]?.[key] ??
        locales
          .map((locale) => data[locale]?.[key] ?? "")
          .find((value) => !isMissingValue(value)) ??
        "";

      if (isMissingValue(fallbackValue)) {
        onNotify?.(t("issuesFixMissingNoSource", { key }));
        return;
      }

      let updatedCount = 0;
      setSaveError(null);
      setStaleData(false);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };

        for (const locale of locales) {
          const currentValue = next[locale]?.[key] ?? "";
          if (!isMissingValue(currentValue)) {
            continue;
          }

          const localeData = { ...(next[locale] ?? {}) };
          localeData[key] = fallbackValue;
          next[locale] = localeData;
          updatedCount += 1;
        }

        return next;
      });

      if (updatedCount === 0) {
        onNotify?.(t("issuesFixNoChanges"));
        return;
      }

      onNotify?.(
        t("issuesFixMissingSuccess", {
          count: updatedCount,
          locale: defaultLocale,
        }),
      );
    },
    [data, defaultLocale, locales, onNotify, t],
  );

  const normalizeIssuePlaceholders = useCallback(
    (key: string) => {
      if (locales.length === 0) {
        return;
      }

      const preferredLocales =
        defaultLocale && locales.includes(defaultLocale)
          ? [defaultLocale, ...locales.filter((locale) => locale !== defaultLocale)]
          : [...locales];

      const referenceTokens =
        preferredLocales
          .map((locale) => getPlaceholderTokensInOrder(data[locale]?.[key] ?? ""))
          .find((tokens) => tokens.length > 0) ?? [];

      if (referenceTokens.length === 0) {
        onNotify?.(t("issuesFixPlaceholderNoSource", { key }));
        return;
      }

      let changedLocales = 0;
      setSaveError(null);
      setStaleData(false);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };

        for (const locale of locales) {
          const currentValue = next[locale]?.[key] ?? "";
          if (isMissingValue(currentValue)) {
            continue;
          }

          const normalizedValue = normalizePlaceholderNames(
            currentValue,
            referenceTokens,
          );
          if (normalizedValue === currentValue) {
            continue;
          }

          const localeData = { ...(next[locale] ?? {}) };
          localeData[key] = normalizedValue;
          next[locale] = localeData;
          changedLocales += 1;
        }

        return next;
      });

      if (changedLocales === 0) {
        onNotify?.(t("issuesFixNoChanges"));
        return;
      }

      onNotify?.(t("issuesFixPlaceholderSuccess", { count: changedLocales }));
    },
    [data, defaultLocale, locales, onNotify, t],
  );

  const deleteUnusedIssueKey = useCallback(
    async (key: string) => {
      const shouldDelete = await dialog.confirm(
        t("issuesFixUnusedDeleteConfirm", { key }),
        {
          confirmLabel: t("delete"),
          cancelLabel: t("cancel"),
          tone: "danger",
        },
      );
      if (!shouldDelete) {
        return;
      }

      setSaveError(null);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };
        for (const locale of locales) {
          const localeData = { ...(next[locale] ?? {}) };
          delete localeData[key];
          next[locale] = localeData;
        }
        return next;
      });

      if (renamingKey === key) {
        cancelRename();
      }

      onNotify?.(t("deleteKeySuccess", { key }));
    },
    [cancelRename, dialog, locales, onNotify, renamingKey, t],
  );

  const deprecateUnusedIssueKey = useCallback(
    async (key: string) => {
      const shouldDeprecate = await dialog.confirm(
        t("issuesFixUnusedDeprecateConfirm", { key }),
        {
          confirmLabel: t("issuesActionDeprecate"),
          cancelLabel: t("cancel"),
        },
      );
      if (!shouldDeprecate) {
        return;
      }

      let changedLocales = 0;
      setSaveError(null);
      setStaleData(false);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };
        for (const locale of locales) {
          const localeData = { ...(next[locale] ?? {}) };
          if (!(key in localeData)) {
            continue;
          }

          const currentValue = localeData[key] ?? "";
          const trimmedValue = currentValue.trim();
          const normalizedValue =
            trimmedValue.length === 0
              ? DEPRECATED_VALUE_PREFIX
              : trimmedValue.startsWith(DEPRECATED_VALUE_PREFIX)
                ? currentValue
                : `${DEPRECATED_VALUE_PREFIX} ${currentValue}`;

          if (normalizedValue === currentValue) {
            continue;
          }

          localeData[key] = normalizedValue;
          next[locale] = localeData;
          changedLocales += 1;
        }
        return next;
      });

      if (changedLocales === 0) {
        onNotify?.(t("issuesFixNoChanges"));
        return;
      }

      onNotify?.(t("issuesFixUnusedDeprecatedSuccess", { key }));
    },
    [dialog, locales, onNotify, t],
  );

  const fillAllMissingFromDefaultLocale = useCallback(() => {
    if (!defaultLocale || locales.length === 0) {
      return;
    }

    const missingKeys = allKeys.filter((key) =>
      locales.some((locale) => isMissingValue(data[locale]?.[key] ?? "")),
    );
    if (missingKeys.length === 0) {
      onNotify?.(t("issuesFixNoChanges"));
      return;
    }

    let updatedCount = 0;
    let touchedKeys = 0;

    setSaveError(null);
    setStaleData(false);
    setData((prev) => {
      const next: FlatTranslationsByLocale = { ...prev };

      for (const key of missingKeys) {
        const fallbackValue =
          next[defaultLocale]?.[key] ??
          locales
            .map((locale) => next[locale]?.[key] ?? "")
            .find((value) => !isMissingValue(value)) ??
          "";

        if (isMissingValue(fallbackValue)) {
          continue;
        }

        let keyUpdated = false;
        for (const locale of locales) {
          const currentValue = next[locale]?.[key] ?? "";
          if (!isMissingValue(currentValue)) {
            continue;
          }

          const localeData = { ...(next[locale] ?? {}) };
          localeData[key] = fallbackValue;
          next[locale] = localeData;
          updatedCount += 1;
          keyUpdated = true;
        }

        if (keyUpdated) {
          touchedKeys += 1;
        }
      }

      return next;
    });

    if (updatedCount === 0) {
      onNotify?.(t("issuesFixNoChanges"));
      return;
    }

    onNotify?.(
      t("issuesFixMissingBulkSuccess", {
        count: updatedCount,
        keys: touchedKeys,
        locale: defaultLocale,
      }),
    );
  }, [allKeys, data, defaultLocale, locales, onNotify, t]);

  const normalizeAllIssuePlaceholders = useCallback(() => {
    const mismatchKeys = allKeys.filter((key) => placeholderMismatchByKey.has(key));
    if (mismatchKeys.length === 0 || locales.length === 0) {
      onNotify?.(t("issuesFixNoChanges"));
      return;
    }

    const preferredLocales =
      defaultLocale && locales.includes(defaultLocale)
        ? [defaultLocale, ...locales.filter((locale) => locale !== defaultLocale)]
        : [...locales];

    let changedLocales = 0;
    let touchedKeys = 0;

    setSaveError(null);
    setStaleData(false);
    setData((prev) => {
      const next: FlatTranslationsByLocale = { ...prev };

      for (const key of mismatchKeys) {
        const referenceTokens =
          preferredLocales
            .map((locale) => getPlaceholderTokensInOrder(next[locale]?.[key] ?? ""))
            .find((tokens) => tokens.length > 0) ?? [];

        if (referenceTokens.length === 0) {
          continue;
        }

        let keyChanged = false;
        for (const locale of locales) {
          const currentValue = next[locale]?.[key] ?? "";
          if (isMissingValue(currentValue)) {
            continue;
          }

          const normalizedValue = normalizePlaceholderNames(
            currentValue,
            referenceTokens,
          );
          if (normalizedValue === currentValue) {
            continue;
          }

          const localeData = { ...(next[locale] ?? {}) };
          localeData[key] = normalizedValue;
          next[locale] = localeData;
          changedLocales += 1;
          keyChanged = true;
        }

        if (keyChanged) {
          touchedKeys += 1;
        }
      }

      return next;
    });

    if (changedLocales === 0) {
      onNotify?.(t("issuesFixNoChanges"));
      return;
    }

    onNotify?.(
      t("issuesFixPlaceholderBulkSuccess", {
        count: changedLocales,
        keys: touchedKeys,
      }),
    );
  }, [allKeys, defaultLocale, locales, onNotify, placeholderMismatchByKey, t]);

  const deprecateAllUnusedIssueKeys = useCallback(async () => {
    const unusedKeys = allKeys.filter((key) => (usage[key]?.count ?? 0) === 0);
    if (unusedKeys.length === 0) {
      onNotify?.(t("issuesFixNoChanges"));
      return;
    }

    const shouldDeprecate = await dialog.confirm(
      t("issuesFixUnusedDeprecateAllConfirm"),
      {
        confirmLabel: t("issuesActionDeprecateAllUnused"),
        cancelLabel: t("cancel"),
      },
    );
    if (!shouldDeprecate) {
      return;
    }

    let changedLocales = 0;
    let touchedKeys = 0;

    setSaveError(null);
    setStaleData(false);
    setData((prev) => {
      const next: FlatTranslationsByLocale = { ...prev };
      for (const key of unusedKeys) {
        let keyChanged = false;
        for (const locale of locales) {
          const localeData = { ...(next[locale] ?? {}) };
          if (!(key in localeData)) {
            continue;
          }

          const currentValue = localeData[key] ?? "";
          const trimmedValue = currentValue.trim();
          const normalizedValue =
            trimmedValue.length === 0
              ? DEPRECATED_VALUE_PREFIX
              : trimmedValue.startsWith(DEPRECATED_VALUE_PREFIX)
                ? currentValue
                : `${DEPRECATED_VALUE_PREFIX} ${currentValue}`;

          if (normalizedValue === currentValue) {
            continue;
          }

          localeData[key] = normalizedValue;
          next[locale] = localeData;
          changedLocales += 1;
          keyChanged = true;
        }
        if (keyChanged) {
          touchedKeys += 1;
        }
      }
      return next;
    });

    if (changedLocales === 0) {
      onNotify?.(t("issuesFixNoChanges"));
      return;
    }

    onNotify?.(
      t("issuesFixUnusedDeprecatedBulkSuccess", {
        keys: touchedKeys,
        count: changedLocales,
      }),
    );
  }, [allKeys, dialog, locales, onNotify, t, usage]);

  const exportXliff = useCallback(
    async (locale: string) => {
      const targetLocale = locale.trim();
      if (!targetLocale || !locales.includes(targetLocale)) {
        setSaveError(t("xliffExportFailed"));
        return;
      }

      try {
        const query = new URLSearchParams({
          locale: targetLocale,
          sourceLocale: defaultLocale || targetLocale,
        }).toString();
        const response = await fetch(`/api/xliff/export?${query}`);
        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const xml = await response.text();
        const blob = new Blob([xml], { type: "application/xliff+xml;charset=utf-8" });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `gloss-${targetLocale}.xlf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);

        setSaveError(null);
        onNotify?.(t("xliffExportSuccess", { locale: targetLocale }));
      } catch (error) {
        const status =
          error instanceof Error && !Number.isNaN(Number(error.message))
            ? Number(error.message)
            : undefined;
        setSaveError(
          status === undefined
            ? t("xliffExportFailed")
            : t("xliffExportFailedWithStatus", { status }),
        );
      }
    },
    [defaultLocale, locales, onNotify, t],
  );

  const importXliff = useCallback(
    async (locale: string, content: string) => {
      const targetLocale = locale.trim();
      if (!targetLocale || !locales.includes(targetLocale)) {
        setSaveError(t("xliffImportFailed"));
        return;
      }
      if (!content.trim()) {
        setSaveError(t("xliffImportFailed"));
        return;
      }

      try {
        const query = new URLSearchParams({ locale: targetLocale }).toString();
        const response = await fetch(`/api/xliff/import?${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const payload = (await response.json()) as { updated?: unknown };
        const updated =
          typeof payload.updated === "number" && Number.isFinite(payload.updated)
            ? payload.updated
            : 0;

        await loadTranslations();
        await loadUsage();
        await loadKeyUsage();
        await loadGitDiff();
        await loadCheckSummary();
        setLastSavedAt(new Date());
        setSaveError(null);
        onNotify?.(
          t("xliffImportSuccess", { locale: targetLocale, count: updated }),
        );
      } catch (error) {
        const status =
          error instanceof Error && !Number.isNaN(Number(error.message))
            ? Number(error.message)
            : undefined;
        setSaveError(
          status === undefined
            ? t("xliffImportFailed")
            : t("xliffImportFailedWithStatus", { status }),
        );
      }
    },
    [loadCheckSummary, loadGitDiff, loadKeyUsage, loadTranslations, loadUsage, locales, onNotify, t],
  );

  const toggleExpandedKey = useCallback((key: string) => {
    setExpandedKey((current) => (current === key ? null : key));
  }, []);

  const toggleNamespaceGroup = useCallback((groupId: string) => {
    setCollapsedNamespaceGroups((prev) => {
      if (prev.includes(groupId)) {
        return prev.filter((id) => id !== groupId);
      }
      return [...prev, groupId];
    });
  }, []);

  const focusKey = useCallback((key: string) => {
    const trimmed = key.trim();
    if (!trimmed) {
      return;
    }

    const namespace = trimmed.split(".").slice(0, -1).join(".");

    setWorkspaceMode("maintenance");
    setFilterValue(trimmed);
    setShowOnlyMissing(false);
    setShowOnlyGitChanged(false);
    setSelectedPage("all");
    setSelectedFile("all");
    setSelectedNamespace(namespace || "all");
    setHighlightedKey(trimmed);
  }, []);

  const reviewChangedKeys = useCallback(() => {
    setWorkspaceMode("maintenance");
    setShowOnlyGitChanged(true);
    setShowOnlyMissing(false);
    setSelectedPage("all");
    setSelectedFile("all");
    setSelectedNamespace("all");
  }, []);

  useEffect(() => {
    if (!highlightedKey) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setHighlightedKey((current) => (current === highlightedKey ? null : current));
    }, 2400);

    return () => window.clearTimeout(timeout);
  }, [highlightedKey]);

  const buildSaveDiffPreview = useCallback(() => {
    const keySet = new Set<string>();
    for (const locale of locales) {
      for (const key of Object.keys(data[locale] ?? {})) {
        keySet.add(key);
      }
      for (const key of Object.keys(baselineData[locale] ?? {})) {
        keySet.add(key);
      }
    }

    const lines: string[] = [];
    for (const key of Array.from(keySet).sort()) {
      for (const locale of locales) {
        const before = baselineData[locale]?.[key] ?? "";
        const after = data[locale]?.[key] ?? "";
        if (before === after) {
          continue;
        }

        const beforeText = before.replace(/\n/g, "\\n");
        const afterText = after.replace(/\n/g, "\\n");
        lines.push(`${key} [${locale}]: "${beforeText}" -> "${afterText}"`);
      }
    }

    return lines;
  }, [baselineData, data, locales]);

  const unifyDuplicateGroup = useCallback(
    async (group: DuplicateValueGroup) => {
      const defaultKey = buildDefaultCommonKey(group.value);
      const nextKeyInput = await dialog.prompt(
        t("duplicatePromptNewKey"),
        defaultKey,
        {
          confirmLabel: t("apply"),
          cancelLabel: t("cancel"),
          placeholder: defaultKey,
        },
      );

      if (nextKeyInput === null) {
        return;
      }

      const nextKey = nextKeyInput.trim();
      const keyValidationError = validateDotKey(nextKey);
      if (keyValidationError) {
        setSaveError(keyValidationError);
        return;
      }

      const duplicateKeySet = new Set(group.keys);
      const keyExistsOutsideGroup =
        allKeys.includes(nextKey) && !duplicateKeySet.has(nextKey);
      if (keyExistsOutsideGroup) {
        setSaveError(t("keyExists"));
        return;
      }

      const referenceValue = `{{${nextKey}}}`;
      const shouldDeleteOldKeys = await dialog.confirm(
        t("duplicateDeleteConfirm", { count: group.keys.length }),
        {
          confirmLabel: t("delete"),
          cancelLabel: t("cancel"),
          tone: "danger",
        },
      );

      const unifyRiskPreview = buildUnifyRiskPreview(
        group,
        nextKey,
        shouldDeleteOldKeys,
      );
      const shouldApplyUnify = await dialog.confirm(unifyRiskPreview.message, {
        confirmLabel: t("apply"),
        cancelLabel: t("cancel"),
        tone:
          shouldDeleteOldKeys || unifyRiskPreview.level === "high"
            ? "danger"
            : "primary",
      });
      if (!shouldApplyUnify) {
        return;
      }

      setSaveError(null);
      setStaleData(false);
      setData((prev) => {
        const next: FlatTranslationsByLocale = { ...prev };

        for (const locale of locales) {
          const localeData = { ...(next[locale] ?? {}) };
          const existingNewKeyValue = localeData[nextKey]?.trim();
          const sourceValue =
            group.keys
              .map((key) => localeData[key] ?? "")
              .find((value) => value.trim() !== "") ?? "";

          localeData[nextKey] =
            existingNewKeyValue && existingNewKeyValue.length > 0 ?
              localeData[nextKey] ?? ""
            : sourceValue || group.value;

          for (const key of group.keys) {
            if (key === nextKey) {
              continue;
            }

            if (shouldDeleteOldKeys) {
              delete localeData[key];
            } else {
              localeData[key] = referenceValue;
            }
          }

          next[locale] = localeData;
        }

        return next;
      });

      if (renamingKey && group.keys.includes(renamingKey) && renamingKey !== nextKey) {
        cancelRename();
      }
    },
    [
      allKeys,
      buildUnifyRiskPreview,
      cancelRename,
      dialog,
      locales,
      renamingKey,
      t,
      validateDotKey,
    ],
  );

  const save = useCallback(async () => {
    if (hasUnsavedChanges) {
      const allChanges = buildSaveDiffPreview();
      const previewLimit = 12;
      const previewLines = allChanges.slice(0, previewLimit);
      const remainingCount = Math.max(0, allChanges.length - previewLines.length);
      const previewMessage = [
        t("saveReviewTitle", { count: allChanges.length, base: gitBaseRef }),
        ...previewLines,
        ...(remainingCount > 0
          ? [t("saveReviewMore", { count: remainingCount })]
          : []),
      ].join("\n");

      const shouldContinue = await dialog.confirm(previewMessage, {
        confirmLabel: t("save"),
        cancelLabel: t("cancel"),
      });
      if (!shouldContinue) {
        return;
      }
    }

    if (staleData) {
      const shouldSave = await dialog.confirm(t("staleSaveConfirm"), {
        confirmLabel: t("save"),
        cancelLabel: t("cancel"),
      });
      if (!shouldSave) {
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    const nextTranslations: Record<string, Record<string, unknown>> = {};

    for (const locale of locales) {
      nextTranslations[locale] = unflattenObject(data[locale] ?? {});
    }

    try {
      const response = await fetch("/api/translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextTranslations),
      });

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      setBaselineData(cloneTranslations(data));
      setStaleData(false);
      setLastSavedAt(new Date());
      void loadGitDiff();
      void loadCheckSummary();
    } catch (error) {
      const status =
        error instanceof Error && !Number.isNaN(Number(error.message))
          ? Number(error.message)
          : undefined;
      setSaveError(
        status === undefined
          ? translateRef.current("saveFailed")
          : translateRef.current("saveFailedWithStatus", { status }),
      );
    } finally {
      setSaving(false);
    }
  }, [
    buildSaveDiffPreview,
    data,
    dialog,
    gitBaseRef,
    hasUnsavedChanges,
    loadCheckSummary,
    loadGitDiff,
    locales,
    staleData,
    t,
  ]);

  const refreshFromDisk = useCallback(async () => {
    if (hasUnsavedChanges) {
      const shouldRefresh = await dialog.confirm(t("refreshDiscardConfirm"), {
        confirmLabel: t("refresh"),
        cancelLabel: t("cancel"),
      });
      if (!shouldRefresh) {
        return;
      }
    }

    await loadTranslations();
    await loadGitDiff();
    await loadCheckSummary();
    setLastSavedAt(null);
  }, [dialog, hasUnsavedChanges, loadCheckSummary, loadGitDiff, loadTranslations, t]);

  useEffect(() => {
    if (loading || loadingError) {
      return;
    }

    const checkForStaleData = async () => {
      if (saving) {
        return;
      }

      try {
        const response = await fetch("/api/translations");
        if (!response.ok) {
          return;
        }

        const json = (await response.json()) as Record<string, TranslationTree>;
        const remote = flattenTranslations(json);
        const remoteSnapshot = serializeTranslations(remote);
        setStaleData(remoteSnapshot !== baselineSnapshot);
      } catch {
        return;
      }
    };

    void checkForStaleData();
    const intervalId = window.setInterval(() => {
      void checkForStaleData();
    }, 8000);

    return () => window.clearInterval(intervalId);
  }, [baselineSnapshot, loading, loadingError, saving]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return {
    data,
    baselineData,
    defaultLocale,
    loading,
    loadingError,
    saveError,
    saving,
    lastSavedAt,
    staleData,
    workspaceMode,
    groupByNamespace,
    filterValue,
    showOnlyMissing,
    filterRules,
    sortConfig,
    newKey,
    newKeyError,
    renamingKey,
    renameValue,
    renameError,
    usage,
    usagePages,
    fileUsages,
    gitBaseRef,
    gitDiffAvailable,
    gitDiffError,
    gitDiffByKey,
    showOnlyGitChanged,
    changedSinceBaseKeySet,
    hardcodedTextCount,
    hardcodedTextPreview,
    hardcodedTextIssues,
    issueBaseline,
    issuesInboxItems,
    duplicateValueGroups,
    namespaceTree,
    namespaceTableGroups,
    collapsedNamespaceGroupSet,
    placeholderMismatchByKey,
    selectedPage,
    selectedFile,
    selectedNamespace,
    selectedFileKeySet,
    expandedKey,
    highlightedKey,
    locales,
    allKeys,
    keys,
    visibleKeys,
    hasUnsavedChanges,
    unsavedChangedKeyCount,
    changedSinceBaseKeyCount,
    hasMissingInView,
    translatedRowsCount,
    totalMissingCells,
    setFilterValue,
    setWorkspaceMode,
    setGroupByNamespace,
    setShowOnlyMissing,
    addFilterRule,
    updateFilterRule,
    removeFilterRule,
    clearFilterRules,
    updateSortConfig,
    clearSort,
    setGitBaseRef,
    setShowOnlyGitChanged,
    setSelectedPage,
    setSelectedFile,
    setSelectedNamespace,
    updateNewKey,
    updateRenameValue,
    isRowMissing,
    isCellDirty,
    textareaRows,
    handleChange,
    addKey,
    startRename,
    cancelRename,
    applyRename,
    deleteKey,
    fillMissingFromDefaultLocale,
    fillAllMissingFromDefaultLocale,
    normalizeIssuePlaceholders,
    normalizeAllIssuePlaceholders,
    deleteUnusedIssueKey,
    deprecateUnusedIssueKey,
    deprecateAllUnusedIssueKeys,
    exportXliff,
    importXliff,
    save,
    refreshFromDisk,
    toggleExpandedKey,
    toggleNamespaceGroup,
    focusKey,
    reviewChangedKeys,
    reloadCheckSummary: loadCheckSummary,
    unifyDuplicateGroup,
  };
}
