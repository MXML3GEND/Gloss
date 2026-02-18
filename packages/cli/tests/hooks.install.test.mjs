import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installPreCommitHooks } from "../dist/hooks.js";

const makeTempProject = async (name) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  return {
    rootDir,
    cleanup: async () => fs.rm(rootDir, { recursive: true, force: true }),
  };
};

test("installPreCommitHooks creates .git pre-commit hook", async () => {
  const project = await makeTempProject("gloss-hooks-git-create");
  const gitDir = path.join(project.rootDir, ".git");
  const hookPath = path.join(gitDir, "hooks", "pre-commit");

  try {
    await fs.mkdir(path.join(gitDir, "hooks"), { recursive: true });
    const result = await installPreCommitHooks(project.rootDir, { gitDirPath: gitDir });

    const content = await fs.readFile(hookPath, "utf8");
    assert.equal(result.gitHook, "created");
    assert.ok(content.includes("npx gloss check --format human"));
    assert.equal(result.huskyHook, "missing");
  } finally {
    await project.cleanup();
  }
});

test("installPreCommitHooks skips .git hook when gloss command already exists", async () => {
  const project = await makeTempProject("gloss-hooks-git-skip");
  const gitDir = path.join(project.rootDir, ".git");
  const hookPath = path.join(gitDir, "hooks", "pre-commit");

  try {
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    await fs.writeFile(
      hookPath,
      "#!/bin/sh\nnpx gloss check --format human\n",
      "utf8",
    );

    const result = await installPreCommitHooks(project.rootDir, { gitDirPath: gitDir });
    assert.equal(result.gitHook, "skipped");
  } finally {
    await project.cleanup();
  }
});

test("installPreCommitHooks updates husky pre-commit hook when present", async () => {
  const project = await makeTempProject("gloss-hooks-husky-update");
  const gitDir = path.join(project.rootDir, ".git");
  const huskyDir = path.join(project.rootDir, ".husky");
  const huskyHookPath = path.join(huskyDir, "pre-commit");

  try {
    await fs.mkdir(path.join(gitDir, "hooks"), { recursive: true });
    await fs.mkdir(path.join(huskyDir, "_"), { recursive: true });
    await fs.writeFile(path.join(huskyDir, "_", "husky.sh"), "echo husky\n", "utf8");
    await fs.writeFile(
      huskyHookPath,
      "#!/usr/bin/env sh\n. \"$(dirname -- \"$0\")/_/husky.sh\"\n\necho \"existing\"\n",
      "utf8",
    );

    const result = await installPreCommitHooks(project.rootDir, { gitDirPath: gitDir });
    const content = await fs.readFile(huskyHookPath, "utf8");

    assert.equal(result.huskyHook, "updated");
    assert.ok(content.includes("echo \"existing\""));
    assert.ok(content.includes("npx gloss check --format human"));
  } finally {
    await project.cleanup();
  }
});

