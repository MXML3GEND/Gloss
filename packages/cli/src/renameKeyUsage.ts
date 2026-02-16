import fs from "node:fs/promises";
import path from "node:path";
import { replaceTranslationKeyLiterals } from "./usageExtractor.js";

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
]);

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const projectRoot = () => process.env.INIT_CWD || process.cwd();

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

const isScannableFile = (fileName: string) =>
  SCANNED_EXTENSIONS.has(path.extname(fileName));

export type RenameKeyUsageResult = {
  changedFiles: string[];
  filesScanned: number;
  replacements: number;
};

export async function renameKeyUsage(
  oldKey: string,
  newKey: string,
  rootDir: string = projectRoot(),
  mode?: "regex" | "ast",
): Promise<RenameKeyUsageResult> {
  if (!oldKey || !newKey || oldKey === newKey) {
    return {
      changedFiles: [],
      filesScanned: 0,
      replacements: 0,
    };
  }

  const changedFiles: string[] = [];
  let filesScanned = 0;
  let replacements = 0;

  const scanDirectory = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        await scanDirectory(fullPath);
        continue;
      }

      if (!entry.isFile() || !isScannableFile(entry.name)) {
        continue;
      }

      filesScanned += 1;

      const source = await fs.readFile(fullPath, "utf8");
      const { updated, replacements: fileReplacements } = replaceTranslationKeyLiterals(
        source,
        fullPath,
        oldKey,
        newKey,
        mode,
      );

      if (fileReplacements === 0 || updated === source) {
        continue;
      }

      replacements += fileReplacements;
      await fs.writeFile(fullPath, updated, "utf8");
      changedFiles.push(normalizePath(path.relative(rootDir, fullPath)));
    }
  };

  await scanDirectory(rootDir);
  changedFiles.sort((left, right) => left.localeCompare(right));

  return {
    changedFiles,
    filesScanned,
    replacements,
  };
}
