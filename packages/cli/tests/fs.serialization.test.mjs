import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeAllTranslations } from "../dist/fs.js";

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
  locales: ["en"],
  defaultLocale: "en",
  path: "src/locales",
  format: "json",
};

test("writeAllTranslations writes recursively sorted keys", async () => {
  const project = await makeTempProject("gloss-fs-sorted");
  const localeFile = path.join(project.rootDir, "src/locales/en.json");

  try {
    await withInitCwd(project.rootDir, async () => {
      await writeAllTranslations(baseConfig, {
        en: {
          z: "last",
          auth: {
            logout: { title: "Bye" },
            login: { subtitle: "Hello", title: "Welcome" },
          },
          a: "first",
        },
      });
    });

    const content = await fs.readFile(localeFile, "utf8");
    assert.equal(
      content,
      `{
  "a": "first",
  "auth": {
    "login": {
      "subtitle": "Hello",
      "title": "Welcome"
    },
    "logout": {
      "title": "Bye"
    }
  },
  "z": "last"
}
`,
    );
  } finally {
    await project.cleanup();
  }
});

test("writeAllTranslations is deterministic across different input key orders", async () => {
  const project = await makeTempProject("gloss-fs-deterministic");
  const localeFile = path.join(project.rootDir, "src/locales/en.json");

  try {
    await withInitCwd(project.rootDir, async () => {
      await writeAllTranslations(baseConfig, {
        en: {
          profile: { title: "Profile", subtitle: "Overview" },
          account: { save: "Save", cancel: "Cancel" },
        },
      });
      const first = await fs.readFile(localeFile, "utf8");

      await writeAllTranslations(baseConfig, {
        en: {
          account: { cancel: "Cancel", save: "Save" },
          profile: { subtitle: "Overview", title: "Profile" },
        },
      });
      const second = await fs.readFile(localeFile, "utf8");
      assert.equal(first, second);
    });
  } finally {
    await project.cleanup();
  }
});

