import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GlossConfigError, loadGlossConfig } from "../dist/config.js";

const makeTempProject = async (name) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  return {
    rootDir,
    cleanup: async () => fs.rm(rootDir, { recursive: true, force: true }),
  };
};

const withInitCwd = async (nextCwd, run) => {
  const previous = process.env.INIT_CWD;
  process.env.INIT_CWD = nextCwd;
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previous;
    }
  }
};

test("loadGlossConfig defaults hardcodedText to enabled with defaults", async () => {
  const project = await makeTempProject("gloss-config-hardcoded-defaults");

  try {
    await fs.mkdir(path.join(project.rootDir, "src/i18n"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/i18n/en.json"),
      "{\n  \"home\": {\"title\": \"Home\"}\n}\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(project.rootDir, "gloss.config.cjs"),
      `module.exports = {
  locales: ["en"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
};
`,
      "utf8",
    );

    await withInitCwd(project.rootDir, async () => {
      const cfg = await loadGlossConfig();
      assert.equal(cfg.hardcodedText?.enabled, true);
      assert.equal(cfg.hardcodedText?.minLength, 3);
      assert.deepEqual(cfg.hardcodedText?.excludePatterns, []);
    });
  } finally {
    await project.cleanup();
  }
});

test("loadGlossConfig rejects invalid hardcodedText exclude regex patterns", async () => {
  const project = await makeTempProject("gloss-config-hardcoded-invalid-regex");

  try {
    await fs.mkdir(path.join(project.rootDir, "src/i18n"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/i18n/en.json"),
      "{\n  \"home\": {\"title\": \"Home\"}\n}\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(project.rootDir, "gloss.config.cjs"),
      `module.exports = {
  locales: ["en"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
  hardcodedText: {
    enabled: true,
    minLength: 3,
    excludePatterns: ["["],
  },
};
`,
      "utf8",
    );

    await withInitCwd(project.rootDir, async () => {
      await assert.rejects(
        () => loadGlossConfig(),
        (error) =>
          error instanceof GlossConfigError &&
          error.code === "INVALID_CONFIG" &&
          /hardcodedText\.excludePatterns/.test(error.message),
      );
    });
  } finally {
    await project.cleanup();
  }
});

