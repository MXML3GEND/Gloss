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
