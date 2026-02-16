import fs from "node:fs/promises";
import path from "node:path";
import type { GlossConfig } from "@gloss/shared";
import { createScanMatcher } from "./scanFilters.js";
import { isLikelyTranslationKey } from "./translationKeys.js";

const SUPPORTED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
];

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
]);

type SourceFileInfo = {
  filePath: string;
  relativePath: string;
  keys: Set<string>;
  imports: string[];
};

const projectRoot = () => process.env.INIT_CWD || process.cwd();

const translationsDir = (cfg: GlossConfig) => {
  if (path.isAbsolute(cfg.path)) {
    return cfg.path;
  }

  return path.join(projectRoot(), cfg.path);
};

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

const hasSkippedPathSegment = (relativePath: string) =>
  normalizePath(relativePath)
    .split("/")
    .some((segment) => SKIP_DIRECTORIES.has(segment));

const isSupportedFile = (name: string) =>
  SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));

const extractTranslationKeys = (content: string): Set<string> => {
  const keys = new Set<string>();
  const regexes = [
    /\b(?:t|i18n\.t|translate)\(\s*["'`]([^"'`]+)["'`]\s*[\),]/g,
    /\bi18nKey\s*=\s*["'`]([^"'`]+)["'`]/g,
  ];

  for (const regex of regexes) {
    let match: RegExpExecArray | null = regex.exec(content);

    while (match) {
      const key = match[1]?.trim();
      if (key && isLikelyTranslationKey(key)) {
        keys.add(key);
      }

      match = regex.exec(content);
    }
  }

  return keys;
};

const extractRelativeImports = (content: string): string[] => {
  const imports = new Set<string>();
  const importRegexes = [
    /import\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const regex of importRegexes) {
    let match: RegExpExecArray | null = regex.exec(content);

    while (match) {
      const specifier = match[1];
      if (specifier.startsWith(".")) {
        imports.add(specifier);
      }
      match = regex.exec(content);
    }
  }

  return Array.from(imports);
};

const resolveImport = async (
  fromFile: string,
  specifier: string,
): Promise<string | null> => {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates: string[] = [];

  if (path.extname(basePath)) {
    candidates.push(basePath);
  } else {
    for (const extension of SUPPORTED_EXTENSIONS) {
      candidates.push(`${basePath}${extension}`);
    }

    for (const extension of SUPPORTED_EXTENSIONS) {
      candidates.push(path.join(basePath, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    try {
      const stat = await awaitStat(candidate);
      if (stat?.isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const awaitStat = async (filePath: string) => {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
};

const isPageFile = (relativePath: string): boolean => {
  const normalized = normalizePath(relativePath);
  const fileName = path.basename(normalized);
  const hasPagesSegment = normalized.includes("/pages/");
  const hasRoutesSegment = normalized.includes("/routes/");
  const isAppEntry = /^App\.(tsx?|jsx?)$/.test(fileName);
  const isNextAppPage =
    normalized.includes("/app/") &&
    /(\/|^)(page|layout|route)\.(tsx?|jsx?|js|ts|vue|svelte)$/.test(normalized);
  const isSvelteKitPage =
    normalized.includes("/routes/") &&
    /(\/|^)\+page(\.server)?\.(ts|js|svelte)$/.test(normalized);

  return (
    hasPagesSegment ||
    hasRoutesSegment ||
    isAppEntry ||
    isNextAppPage ||
    isSvelteKitPage
  );
};

const collectFiles = async (
  directory: string,
  projectDir: string,
  shouldScanFile: (relativePath: string) => boolean,
  files: SourceFileInfo[],
): Promise<void> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await collectFiles(fullPath, projectDir, shouldScanFile, files);
      continue;
    }

    if (!entry.isFile() || !isSupportedFile(entry.name)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(projectDir, fullPath));
    if (hasSkippedPathSegment(relativePath)) {
      continue;
    }

    if (!shouldScanFile(relativePath)) {
      continue;
    }

    const content = await fs.readFile(fullPath, "utf8");
    files.push({
      filePath: fullPath,
      relativePath,
      keys: extractTranslationKeys(content),
      imports: extractRelativeImports(content),
    });
  }
};

export async function buildKeyUsageMap(cfg: GlossConfig) {
  const root = projectRoot();
  const i18nDirectory = translationsDir(cfg);
  const candidateRoots = [
    path.dirname(i18nDirectory),
    path.join(root, "src"),
    path.join(root, "app"),
    path.join(root, "pages"),
    path.join(root, "routes"),
  ];
  const sourceRoots = Array.from(
    new Set(candidateRoots.filter((candidate) => path.resolve(candidate) !== root)),
  );

  const files: SourceFileInfo[] = [];
  const shouldScanFile = createScanMatcher(cfg.scan);

  for (const sourceRoot of sourceRoots) {
    const stat = await awaitStat(sourceRoot);
    if (!stat?.isDirectory()) {
      continue;
    }

    await collectFiles(sourceRoot, root, shouldScanFile, files);
  }

  const fileByPath = new Map(files.map((file) => [path.resolve(file.filePath), file]));
  const adjacency = new Map<string, string[]>();

  for (const file of files) {
    const imports: string[] = [];

    for (const specifier of file.imports) {
      const resolvedImport = await resolveImport(file.filePath, specifier);
      if (resolvedImport) {
        const normalizedImport = path.resolve(resolvedImport);
        if (fileByPath.has(normalizedImport)) {
          imports.push(normalizedImport);
        }
      }
    }

    adjacency.set(path.resolve(file.filePath), imports);
  }

  const pages = files.filter((file) => isPageFile(file.relativePath));

  const resultFiles = files
    .filter((file) => file.keys.size > 0)
    .map((file) => {
      const normalizedRelativePath = normalizePath(file.relativePath);
      return {
        id: normalizedRelativePath,
        file: normalizedRelativePath,
        keys: Array.from(file.keys).sort(),
      };
    })
    .sort((left, right) => left.file.localeCompare(right.file));

  const resultPages = pages
    .map((pageFile) => {
      const visited = new Set<string>();
      const queue = [path.resolve(pageFile.filePath)];
      const keys = new Set<string>();

      while (queue.length > 0) {
        const current = queue.pop();
        if (!current || visited.has(current)) {
          continue;
        }

        visited.add(current);
        const currentFile = fileByPath.get(current);
        if (!currentFile) {
          continue;
        }

        for (const key of currentFile.keys) {
          keys.add(key);
        }

        for (const next of adjacency.get(current) ?? []) {
          if (!visited.has(next)) {
            queue.push(next);
          }
        }
      }

      const normalizedRelativePath = normalizePath(pageFile.relativePath);
      const id = normalizedRelativePath.replace(/\.[^.]+$/, "");

      return {
        id,
        file: normalizedRelativePath,
        keys: Array.from(keys).sort(),
      };
    })
    .sort((left, right) => left.file.localeCompare(right.file));

  return {
    pages: resultPages,
    files: resultFiles,
    generatedAt: new Date().toISOString(),
  };
}
