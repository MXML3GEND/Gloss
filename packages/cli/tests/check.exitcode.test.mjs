import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeConfig = async (rootDir, options = {}) => {
  const strictPlaceholders =
    typeof options.strictPlaceholders === "boolean"
      ? `  strictPlaceholders: ${options.strictPlaceholders},\n`
      : "";
  await fs.writeFile(
    path.join(rootDir, "gloss.config.cjs"),
    `module.exports = {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
${strictPlaceholders}
};
`,
    "utf8",
  );
};

const makeTempProject = async (name) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  return {
    rootDir,
    cleanup: async () => fs.rm(rootDir, { recursive: true, force: true }),
  };
};

const runCheck = (rootDir) => {
  const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  return spawnSync(process.execPath, [cliPath, "check", "--json"], {
    env: { ...process.env, INIT_CWD: rootDir },
    encoding: "utf8",
  });
};

test("gloss check exits 0 when only warning categories are present", async () => {
  const project = await makeTempProject("gloss-check-exit-warning");

  try {
    await writeConfig(project.rootDir);
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      unused: { title: "Unused" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      unused: { title: "Ongebruikt" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/Page.tsx"),
      "export const Page = () => <p>Plain text</p>;\n",
      "utf8",
    );

    const result = runCheck(project.rootDir);
    assert.equal(result.status, 0);

    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.status, "pass");
    assert.equal(parsed.summary.errorIssues, 0);
    assert.ok(parsed.summary.warningIssues >= 1);
  } finally {
    await project.cleanup();
  }
});

test("gloss check exits 1 when blocking categories are present", async () => {
  const project = await makeTempProject("gloss-check-exit-error");

  try {
    await writeConfig(project.rootDir);
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      auth: { login: { title: "Welcome" } },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      auth: { login: { title: "" } },
    });

    const result = runCheck(project.rootDir);
    assert.equal(result.status, 1);

    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.status, "fail");
    assert.ok(parsed.summary.errorIssues > 0);
  } finally {
    await project.cleanup();
  }
});

test("gloss check exits 1 on placeholder mismatch when strictPlaceholders is enabled", async () => {
  const project = await makeTempProject("gloss-check-exit-strict-placeholders");

  try {
    await writeConfig(project.rootDir, { strictPlaceholders: true });
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      profile: { greeting: "Hello {name}" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      profile: { greeting: "Hallo" },
    });

    const result = runCheck(project.rootDir);
    assert.equal(result.status, 1);

    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.status, "fail");
    assert.equal(parsed.summary.placeholderMismatches, 1);
  } finally {
    await project.cleanup();
  }
});

test("gloss check exits 0 on placeholder mismatch when strictPlaceholders is disabled", async () => {
  const project = await makeTempProject("gloss-check-exit-nonstrict-placeholders");

  try {
    await writeConfig(project.rootDir, { strictPlaceholders: false });
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      profile: { greeting: "Hello {name}" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      profile: { greeting: "Hallo" },
    });

    const result = runCheck(project.rootDir);
    assert.equal(result.status, 0);

    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.status, "pass");
    assert.equal(parsed.summary.placeholderMismatches, 1);
    assert.ok(parsed.policy.warnOn.includes("placeholderMismatches"));
    assert.ok(!parsed.policy.failOn.includes("placeholderMismatches"));
  } finally {
    await project.cleanup();
  }
});
