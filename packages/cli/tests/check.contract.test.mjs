import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runGlossCheck } from "../dist/check.js";

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

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

const baseConfig = {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
};

test("runGlossCheck keeps warning-only projects as pass", async () => {
  const project = await makeTempProject("gloss-check-warning-pass");

  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      unused: { title: "Unused" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      unused: { title: "Ongebruikt" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/App.tsx"),
      "export const App = () => <p>Visible text</p>;\n",
      "utf8",
    );

    await withInitCwd(project.rootDir, async () => {
      const result = await runGlossCheck(baseConfig);
      assert.equal(result.schemaVersion, 1);
      assert.equal(result.status, "pass");
      assert.equal(result.ok, true);
      assert.deepEqual(result.policy.failOn, [
        "missingTranslations",
        "invalidKeys",
        "placeholderMismatches",
      ]);
      assert.deepEqual(result.policy.warnOn, ["orphanKeys", "hardcodedTexts"]);
      assert.equal(result.summary.errorIssues, 0);
      assert.ok(result.summary.warningIssues >= 1);
      assert.equal(result.summary.totalIssues, result.summary.warningIssues);
    });
  } finally {
    await project.cleanup();
  }
});

test("runGlossCheck fails when blocking issue types are present", async () => {
  const project = await makeTempProject("gloss-check-error-fail");

  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      auth: { title: "Welcome" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {});

    await withInitCwd(project.rootDir, async () => {
      const result = await runGlossCheck(baseConfig);
      assert.equal(result.status, "fail");
      assert.equal(result.ok, false);
      assert.ok(result.summary.missingTranslations > 0);
      assert.ok(result.summary.errorIssues > 0);
    });
  } finally {
    await project.cleanup();
  }
});

