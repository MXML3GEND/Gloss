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

test("loadGlossConfig defaults strictPlaceholders to true", async () => {
  const project = await makeTempProject("gloss-config-strict-placeholders-default");

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
      assert.equal(cfg.strictPlaceholders, true);
    });
  } finally {
    await project.cleanup();
  }
});

test("loadGlossConfig rejects non-boolean strictPlaceholders", async () => {
  const project = await makeTempProject("gloss-config-strict-placeholders-invalid");

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
  strictPlaceholders: "yes",
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
          /strictPlaceholders/.test(error.message),
      );
    });
  } finally {
    await project.cleanup();
  }
});
