import path from "node:path";
import ts from "typescript";
import { isLikelyTranslationKey } from "./translationKeys.js";

type ScanMode = "regex" | "ast";

const REGEX_PATTERNS = [
  /\b(?:t|i18n\.t|translate)\(\s*["'`]([^"'`]+)["'`]\s*[\),]/g,
  /\bi18nKey\s*=\s*["'`]([^"'`]+)["'`]/g,
];

const normalizeMode = (mode: string | undefined): ScanMode =>
  mode === "ast" ? "ast" : "regex";

const scriptKindForFile = (filePath: string): ts.ScriptKind => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") {
    return ts.ScriptKind.TSX;
  }
  if (extension === ".jsx") {
    return ts.ScriptKind.JSX;
  }
  if (extension === ".ts" || extension === ".mts" || extension === ".cts") {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
};

const getLiteralText = (node: ts.Expression | undefined): string | null => {
  if (!node) {
    return null;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return null;
};

const isTranslationCallee = (expression: ts.Expression) => {
  if (ts.isIdentifier(expression)) {
    return expression.text === "t" || expression.text === "translate";
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    return expression.expression.text === "i18n" && expression.name.text === "t";
  }

  return false;
};

const isI18nKeyAttribute = (name: ts.JsxAttributeName) =>
  ts.isIdentifier(name) && name.text === "i18nKey";

const extractWithAst = (source: string, filePath: string) => {
  const keys: string[] = [];
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  );

  const pushKey = (value: string | null) => {
    const key = value?.trim();
    if (key && isLikelyTranslationKey(key)) {
      keys.push(key);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTranslationCallee(node.expression)) {
      pushKey(getLiteralText(node.arguments[0] as ts.Expression | undefined));
    } else if (ts.isJsxAttribute(node) && isI18nKeyAttribute(node.name)) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        pushKey(node.initializer.text);
      } else if (
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      ) {
        pushKey(getLiteralText(node.initializer.expression));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return keys;
};

const extractWithRegex = (source: string) => {
  const keys: string[] = [];

  for (const regex of REGEX_PATTERNS) {
    let match = regex.exec(source);

    while (match) {
      const key = match[1]?.trim();
      if (key && isLikelyTranslationKey(key)) {
        keys.push(key);
      }

      match = regex.exec(source);
    }

    regex.lastIndex = 0;
  }

  return keys;
};

export const extractTranslationKeys = (
  source: string,
  filePath: string,
  mode?: string,
) => {
  const normalizedMode = normalizeMode(mode);
  if (normalizedMode === "ast") {
    return extractWithAst(source, filePath);
  }

  return extractWithRegex(source);
};

export const replaceTranslationKeyLiterals = (
  source: string,
  filePath: string,
  oldKey: string,
  newKey: string,
  mode?: string,
) => {
  const normalizedMode = normalizeMode(mode);

  if (normalizedMode === "regex") {
    let replacements = 0;
    const regex = /(\b(?:t|translate)\s*\(\s*)(['"])([^'"]+)\2/g;
    const updated = source.replace(
      regex,
      (match, prefix: string, quote: string, key: string) => {
        if (key !== oldKey) {
          return match;
        }

        replacements += 1;
        return `${prefix}${quote}${newKey}${quote}`;
      },
    );
    regex.lastIndex = 0;

    return { updated, replacements };
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  );

  const edits: Array<{ start: number; end: number; text: string }> = [];

  const queueEditForLiteral = (node: ts.Node) => {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const quote = source[start] === "`" ? "`" : source[start] === "'" ? "'" : '"';
    edits.push({ start, end, text: `${quote}${newKey}${quote}` });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTranslationCallee(node.expression)) {
      const firstArg = node.arguments[0];
      if (
        firstArg &&
        (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) &&
        firstArg.text === oldKey
      ) {
        queueEditForLiteral(firstArg);
      }
    } else if (ts.isJsxAttribute(node) && isI18nKeyAttribute(node.name)) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        if (node.initializer.text === oldKey) {
          queueEditForLiteral(node.initializer);
        }
      } else if (
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        (ts.isStringLiteral(node.initializer.expression) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer.expression)) &&
        node.initializer.expression.text === oldKey
      ) {
        queueEditForLiteral(node.initializer.expression);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  edits.sort((left, right) => right.start - left.start);

  let updated = source;
  for (const edit of edits) {
    updated = `${updated.slice(0, edit.start)}${edit.text}${updated.slice(edit.end)}`;
  }

  return {
    updated,
    replacements: edits.length,
  };
};
