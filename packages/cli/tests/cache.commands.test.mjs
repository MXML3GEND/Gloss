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
  const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  return spawnSync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, INIT_CWD: rootDir },
    encoding: "utf8",
  });
};

test("cache status and clear commands report scanner cache metrics", async () => {
  const project = await makeTempProject("gloss-cache-commands");

  try {
    await writeConfig(project.rootDir);
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      home: { title: "Home" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      home: { title: "Start" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/Page.tsx"),
      "export const Page = () => t('home.title');\n",
      "utf8",
    );

    const noCacheCheck = runCli(project.rootDir, ["check", "--json", "--no-cache"]);
    assert.equal(noCacheCheck.status, 0);

    const statusBefore = runCli(project.rootDir, ["cache", "status"]);
    assert.equal(statusBefore.status, 0);
    assert.match(statusBefore.stdout, /Metrics file: not found/);
    assert.match(statusBefore.stdout, /Stale relative to config: yes/);

    const cachedCheck = runCli(project.rootDir, ["check", "--json"]);
    assert.equal(cachedCheck.status, 0);

    const statusAfter = runCli(project.rootDir, ["cache", "status"]);
    assert.equal(statusAfter.status, 0);
    assert.match(statusAfter.stdout, /Metrics file: found/);
    assert.match(statusAfter.stdout, /Usage scanner: \d+ files/);

    const clear = runCli(project.rootDir, ["cache", "clear"]);
    assert.equal(clear.status, 0);
    assert.match(clear.stdout, /Gloss cache clear/);
    assert.match(clear.stdout, /Cache metrics file: removed/);
  } finally {
    await project.cleanup();
  }
});
