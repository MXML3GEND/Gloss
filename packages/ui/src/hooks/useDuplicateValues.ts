import { useMemo } from "react";
import type {
  DuplicateValueGroup,
  FlatTranslationsByLocale,
} from "../types/translations";

const MIN_DUPLICATE_VALUE_LENGTH = 3;

export function useDuplicateValues(data: FlatTranslationsByLocale) {
  const groups = useMemo(() => {
    const valueToKeys = new Map<string, Set<string>>();

    for (const localeData of Object.values(data)) {
      for (const [key, rawValue] of Object.entries(localeData ?? {})) {
        const value = rawValue.trim();

        if (!value || value.length < MIN_DUPLICATE_VALUE_LENGTH) {
          continue;
        }

        if (key.startsWith("common.")) {
          continue;
        }

        const keys = valueToKeys.get(value) ?? new Set<string>();
        keys.add(key);
        valueToKeys.set(value, keys);
      }
    }

    return Array.from(valueToKeys.entries())
      .map(([value, keys]) => ({
        value,
        keys: Array.from(keys).sort(),
      }))
      .filter((group) => group.keys.length >= 3)
      .map<DuplicateValueGroup>((group) => ({
        id: `value:${group.value}:${group.keys.join("||")}`,
        value: group.value,
        keys: group.keys,
        count: group.keys.length,
      }))
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }

        return left.value.localeCompare(right.value);
      });
  }, [data]);

  return {
    groups,
  };
}
