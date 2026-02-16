type TranslationNode = Record<string, unknown>;

const isPlainObject = (value: unknown): value is TranslationNode => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const flattenObject = (obj: TranslationNode): Record<string, string> => {
  const result: Record<string, string> = {};

  const visit = (node: TranslationNode, path: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const nextPath = path ? `${path}.${key}` : key;

      if (isPlainObject(value)) {
        visit(value, nextPath);
        continue;
      }

      if (typeof value === "string") {
        result[nextPath] = value;
        continue;
      }

      if (value !== undefined) {
        result[nextPath] = String(value);
      }
    }
  };

  visit(obj, "");
  return result;
};

export const unflattenObject = (
  flat: Record<string, string>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(flat)) {
    if (!path) {
      continue;
    }

    const keys = path.split(".");
    const leafKey = keys.pop();

    if (!leafKey) {
      continue;
    }

    let cursor: Record<string, unknown> = result;

    for (const key of keys) {
      const current = cursor[key];

      if (!isPlainObject(current)) {
        cursor[key] = {};
      }

      cursor = cursor[key] as Record<string, unknown>;
    }

    cursor[leafKey] = value;
  }

  return result;
};
