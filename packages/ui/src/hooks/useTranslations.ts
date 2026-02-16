import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useDuplicateValues } from "./useDuplicateValues";
import type { DialogApi } from "./useModalDialog";
import { flattenObject, unflattenObject } from "../utils/translationTree";
import type {
  DuplicateValueGroup,
  FlatTranslationsByLocale,
  KeyUsageFile,
  KeyUsagePage,
  TableFilterRule,
  TableSortConfig,
  TranslateFn,
  TranslationTree,
  UsageMap,
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

type UseTranslationsParams = {
  t: TranslateFn;
  dialog: DialogApi;
};

export function useTranslations({ t, dialog }: UseTranslationsParams) {
  const [data, setData] = useState<FlatTranslationsByLocale>({});
  const [baselineData, setBaselineData] = useState<FlatTranslationsByLocale>({});
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [staleData, setStaleData] = useState(false);
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
  const [selectedPage, setSelectedPage] = useState("all");
  const [selectedFile, setSelectedFile] = useState("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const translateRef = useRef<TranslateFn>(t);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

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

  const validateDotKey = useCallback(
    (value: string): string | null => {
      const key = value.trim();

      if (!key) return t("keyRequired");
      if (key.startsWith(".") || key.endsWith(".")) {
        return t("keyBoundaryDot");
      }
      if (key.includes("..")) {
        return t("keyConsecutiveDots");
      }
      if (key.split(".").some((segment) => segment.trim() === "")) {
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
  }, []);

  useEffect(() => {
    void loadTranslations();
  }, [loadTranslations]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    void loadKeyUsage();
  }, [loadKeyUsage]);

  const locales = Object.keys(data);
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
  const normalizedFilter = filterValue.trim().toLowerCase();

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
    if (normalizedFilter && !key.toLowerCase().includes(normalizedFilter)) {
      return false;
    }

    if (showOnlyMissing && !isRowMissing(key)) {
      return false;
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

  const visibleKeys = useMemo(() => {
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
  const totalMissingCells = allKeys.reduce((count, key) => {
    return (
      count +
      locales.reduce((localeCount, locale) => {
        return localeCount + (isMissingValue(data[locale]?.[key] ?? "") ? 1 : 0);
      }, 0)
    );
  }, 0);

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
      cancelRename,
      loadKeyUsage,
      loadUsage,
      locales,
      renameValue,
      t,
      validateDotKey,
    ],
  );

  const deleteKey = useCallback(
    async (key: string) => {
      const shouldDelete = await dialog.confirm(t("deleteKeyConfirm", { key }), {
        confirmLabel: t("delete"),
        cancelLabel: t("cancel"),
        tone: "danger",
      });
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
    },
    [cancelRename, dialog, locales, renamingKey, t],
  );

  const toggleExpandedKey = useCallback((key: string) => {
    setExpandedKey((current) => (current === key ? null : key));
  }, []);

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
    [allKeys, cancelRename, dialog, locales, renamingKey, t, validateDotKey],
  );

  const save = useCallback(async () => {
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
  }, [data, dialog, locales, staleData, t]);

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
    setLastSavedAt(null);
  }, [dialog, hasUnsavedChanges, loadTranslations, t]);

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
    loading,
    loadingError,
    saveError,
    saving,
    lastSavedAt,
    staleData,
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
    duplicateValueGroups,
    placeholderMismatchByKey,
    selectedPage,
    selectedFile,
    selectedFileKeySet,
    expandedKey,
    locales,
    allKeys,
    keys,
    visibleKeys,
    hasUnsavedChanges,
    hasMissingInView,
    totalMissingCells,
    setFilterValue,
    setShowOnlyMissing,
    addFilterRule,
    updateFilterRule,
    removeFilterRule,
    clearFilterRules,
    updateSortConfig,
    clearSort,
    setSelectedPage,
    setSelectedFile,
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
    save,
    refreshFromDisk,
    toggleExpandedKey,
    unifyDuplicateGroup,
  };
}
