import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverLocaleDirectoryCandidates } from "../dist/config.js";

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

test("discoverLocaleDirectoryCandidates prefers src/locales style directories", async () => {
  const project = await makeTempProject("gloss-config-discovery");

  try {
    await writeJson(path.join(project.rootDir, "src/locales/en.json"), {
      hello: "world",
    });
    await writeJson(path.join(project.rootDir, "src/locales/nl.json"), {
      hello: "wereld",
    });
    await writeJson(path.join(project.rootDir, "app/messages/fr.json"), {
      hello: "bonjour",
    });

    const candidates = await discoverLocaleDirectoryCandidates(project.rootDir);
    assert.ok(candidates.length >= 2);
    assert.equal(candidates[0].path, "src/locales");
    assert.deepEqual(candidates[0].locales, ["en", "nl"]);
    assert.ok(candidates[0].score >= candidates[1].score);
  } finally {
    await project.cleanup();
  }
});

test("discoverLocaleDirectoryCandidates returns empty array when no locale files exist", async () => {
  const project = await makeTempProject("gloss-config-discovery-empty");

  try {
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    const candidates = await discoverLocaleDirectoryCandidates(project.rootDir);
    assert.deepEqual(candidates, []);
  } finally {
    await project.cleanup();
  }
});

