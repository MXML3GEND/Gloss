import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeConfig = async (rootDir) => {
  await fs.writeFile(
    path.join(rootDir, "gloss.config.cjs"),
    `module.exports = {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
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

const runCli = (rootDir, args) => {
  return spawnSync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, INIT_CWD: rootDir },
    encoding: "utf8",
  });
};

test("gloss check writes baseline and reports delta against previous run", async () => {
  const project = await makeTempProject("gloss-baseline-check");

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
      path.join(project.rootDir, "src/App.tsx"),
      "export const App = () => <p>Visible text</p>;\n",
      "utf8",
    );

    const first = runCli(project.rootDir, ["check", "--json"]);
    assert.equal(first.status, 0);
    const firstPayload = JSON.parse(first.stdout.trim());
    assert.equal(firstPayload.baseline.hasPrevious, false);
    assert.equal(firstPayload.baseline.delta.totalIssues, 0);

    const baselineFilePath = path.join(project.rootDir, ".gloss", "baseline.json");
    const baselineRaw = await fs.readFile(baselineFilePath, "utf8");
    const baselineJson = JSON.parse(baselineRaw);
    assert.equal(baselineJson.schemaVersion, 1);

    const second = runCli(project.rootDir, ["check", "--json"]);
    assert.equal(second.status, 0);
    const secondPayload = JSON.parse(second.stdout.trim());
    assert.equal(secondPayload.baseline.hasPrevious, true);
    assert.equal(secondPayload.baseline.delta.totalIssues, 0);
  } finally {
    await project.cleanup();
  }
});

test("gloss baseline reset removes local baseline file", async () => {
  const project = await makeTempProject("gloss-baseline-reset");

  try {
    await writeConfig(project.rootDir);
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      auth: { title: "Welcome" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      auth: { title: "Welkom" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/App.tsx"),
      "export const App = () => <p>Visible text</p>;\n",
      "utf8",
    );

    const checkResult = runCli(project.rootDir, ["check", "--json"]);
    assert.equal(checkResult.status, 0);

    const baselinePath = path.join(project.rootDir, ".gloss", "baseline.json");
    await fs.access(baselinePath);

    const resetResult = runCli(project.rootDir, ["baseline", "reset"]);
    assert.equal(resetResult.status, 0);
    await assert.rejects(fs.access(baselinePath), /ENOENT/);
  } finally {
    await project.cleanup();
  }
});
