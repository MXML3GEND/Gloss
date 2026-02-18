import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const GLOSS_HOOK_MARKER = "# gloss-pre-commit";
const GLOSS_HUSKY_MARKER = "# gloss-husky-hook";
const GLOSS_HOOK_COMMAND = "npx gloss check --format human";

type HookWriteStatus = "created" | "updated" | "skipped" | "missing";

export type HookInstallResult = {
  gitHook: HookWriteStatus;
  huskyHook: HookWriteStatus;
  messages: string[];
};

type InstallOptions = {
  gitDirPath?: string | null;
};

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const resolveGitDir = (projectDir: string): string | null => {
  try {
    const raw = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (!raw) {
      return null;
    }
    if (path.isAbsolute(raw)) {
      return raw;
    }
    return path.resolve(projectDir, raw);
  } catch {
    return null;
  }
};

const writeExecutable = async (filePath: string, content: string) => {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
};

const installGitHook = async (hookPath: string): Promise<HookWriteStatus> => {
  const nextSnippet = `\n${GLOSS_HOOK_MARKER}\n${GLOSS_HOOK_COMMAND}\n`;

  if (!(await fileExists(hookPath))) {
    await writeExecutable(
      hookPath,
      `#!/bin/sh\nset -e${nextSnippet}`,
    );
    return "created";
  }

  const existing = await fs.readFile(hookPath, "utf8");
  if (existing.includes(GLOSS_HOOK_MARKER) || existing.includes(GLOSS_HOOK_COMMAND)) {
    return "skipped";
  }

  const suffix = existing.endsWith("\n") ? nextSnippet : `\n${nextSnippet}`;
  await writeExecutable(hookPath, `${existing}${suffix}`);
  return "updated";
};

const installHuskyHook = async (
  huskyDirectoryPath: string,
): Promise<HookWriteStatus> => {
  if (!(await fileExists(huskyDirectoryPath))) {
    return "missing";
  }

  const hookPath = path.join(huskyDirectoryPath, "pre-commit");
  const huskyBootstrapPath = path.join(huskyDirectoryPath, "_", "husky.sh");
  const huskyBootstrapLine = `. "$(dirname -- "$0")/_/husky.sh"`;
  const nextSnippet = `\n${GLOSS_HUSKY_MARKER}\n${GLOSS_HOOK_COMMAND}\n`;

  if (!(await fileExists(hookPath))) {
    const bootstrap = (await fileExists(huskyBootstrapPath))
      ? `${huskyBootstrapLine}\n\n`
      : "";
    await writeExecutable(hookPath, `#!/usr/bin/env sh\n${bootstrap}${nextSnippet}`);
    return "created";
  }

  const existing = await fs.readFile(hookPath, "utf8");
  if (existing.includes(GLOSS_HUSKY_MARKER) || existing.includes(GLOSS_HOOK_COMMAND)) {
    return "skipped";
  }

  const suffix = existing.endsWith("\n") ? nextSnippet : `\n${nextSnippet}`;
  await writeExecutable(hookPath, `${existing}${suffix}`);
  return "updated";
};

export async function installPreCommitHooks(
  projectDir: string,
  options?: InstallOptions,
): Promise<HookInstallResult> {
  const messages: string[] = [];
  const gitDir =
    options?.gitDirPath === undefined
      ? resolveGitDir(projectDir)
      : options.gitDirPath;

  let gitHook: HookWriteStatus = "missing";
  if (gitDir) {
    const hooksDir = path.join(gitDir, "hooks");
    await fs.mkdir(hooksDir, { recursive: true });
    gitHook = await installGitHook(path.join(hooksDir, "pre-commit"));
    messages.push(`.git hook: ${gitHook}`);
  } else {
    messages.push(".git hook: missing (not a git repository)");
  }

  const huskyHook = await installHuskyHook(path.join(projectDir, ".husky"));
  messages.push(`husky hook: ${huskyHook}`);

  if (gitHook === "missing" && huskyHook === "missing") {
    messages.push("No hook target found. Initialize git or husky first.");
  }

  return {
    gitHook,
    huskyHook,
    messages,
  };
}

