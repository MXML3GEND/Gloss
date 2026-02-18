type TranslationNode = Record<string, unknown>;

const isPlainObject = (value: unknown): value is TranslationNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  const root: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".").filter((part) => part.length > 0);
    if (parts.length === 0) {
      continue;
    }

    let cursor: Record<string, unknown> = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const existing = cursor[part];
      if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }

    cursor[parts[parts.length - 1]] = value;
  }

  return root;
};
