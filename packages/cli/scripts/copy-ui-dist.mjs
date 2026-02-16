import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDir, "..");
const uiDistDir = path.resolve(cliRoot, "../ui/dist");
const targetDir = path.resolve(cliRoot, "dist/ui");

const ensureUiDist = async () => {
  try {
    const stat = await fs.stat(uiDistDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

const main = async () => {
  const hasUiDist = await ensureUiDist();
  if (!hasUiDist) {
    throw new Error(
      `Missing UI build at ${uiDistDir}. Run "npm -w @gloss/ui run build" before building CLI.`,
    );
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(uiDistDir, targetDir, { recursive: true });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
