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

test("hardcoded check supports gloss-ignore marker suppression", async () => {
  const project = await makeTempProject("gloss-hardcoded-ignore");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      home: { title: "Home" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      home: { title: "Start" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/Page.tsx"),
      [
        "export const Page = () => (",
        "  <main>",
        "    {/* gloss-ignore */}",
        "    <p>Ignore this</p>",
        "    <p>Keep this</p>",
        "  </main>",
        ");",
        "",
      ].join("\n"),
      "utf8",
    );

    await withInitCwd(project.rootDir, async () => {
      const result = await runGlossCheck(baseConfig);
      assert.equal(result.summary.hardcodedTexts, 1);
      assert.equal(result.summary.suppressedHardcodedTexts, 1);
      assert.equal(result.hardcodedTexts[0].text, "Keep this");
    });
  } finally {
    await project.cleanup();
  }
});

test("hardcoded check supports minLength", async () => {
  const project = await makeTempProject("gloss-hardcoded-min-length");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      home: { title: "Home" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      home: { title: "Start" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/Page.tsx"),
      "export const Page = () => <p>short</p>;\n",
      "utf8",
    );

    await withInitCwd(project.rootDir, async () => {
      const result = await runGlossCheck({
        ...baseConfig,
        hardcodedText: { enabled: true, minLength: 10, excludePatterns: [] },
      });
      assert.equal(result.summary.hardcodedTexts, 0);
      assert.equal(result.summary.suppressedHardcodedTexts, 0);
    });
  } finally {
    await project.cleanup();
  }
});

test("hardcoded check supports excludePatterns", async () => {
  const project = await makeTempProject("gloss-hardcoded-exclude");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      home: { title: "Home" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      home: { title: "Start" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/Page.tsx"),
      [
        "export const Page = () => (",
        "  <main>",
        "    <p>Ignore this text</p>",
        "    <p>Keep this text</p>",
        "  </main>",
        ");",
        "",
      ].join("\n"),
      "utf8",
    );

    await withInitCwd(project.rootDir, async () => {
      const result = await runGlossCheck({
        ...baseConfig,
        hardcodedText: {
          enabled: true,
          minLength: 3,
          excludePatterns: ["^Ignore this text$"],
        },
      });
      assert.equal(result.summary.hardcodedTexts, 1);
      assert.equal(result.summary.suppressedHardcodedTexts, 1);
      assert.equal(result.hardcodedTexts[0].text, "Keep this text");
    });
  } finally {
    await project.cleanup();
  }
});

test("hardcoded check supports enabled=false", async () => {
  const project = await makeTempProject("gloss-hardcoded-disabled");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      home: { title: "Home" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      home: { title: "Start" },
    });
    await fs.mkdir(path.join(project.rootDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/Page.tsx"),
      "export const Page = () => <p>Visible text</p>;\n",
      "utf8",
    );

    await withInitCwd(project.rootDir, async () => {
      const result = await runGlossCheck({
        ...baseConfig,
        hardcodedText: { enabled: false, minLength: 3, excludePatterns: [] },
      });
      assert.equal(result.summary.hardcodedTexts, 0);
      assert.equal(result.summary.suppressedHardcodedTexts, 0);
    });
  } finally {
    await project.cleanup();
  }
});

