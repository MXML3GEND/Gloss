import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOCALES = ["en", "nl", "fr", "de"];
const NAMESPACES = ["auth", "dashboard", "billing"];
const DEFAULT_KEY_COUNT = 1000;
const DEFAULT_FILE_COUNT = 80;
const CALLS_PER_FILE = 24;

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const setNested = (target, keyPath, value) => {
  let cursor = target;
  for (let index = 0; index < keyPath.length - 1; index += 1) {
    const segment = keyPath[index];
    if (!cursor[segment] || typeof cursor[segment] !== "object") {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[keyPath[keyPath.length - 1]] = value;
};

const buildNestedTree = (locale, keyCount) => {
  const tree = {};

  for (let index = 0; index < keyCount; index += 1) {
    const namespace = NAMESPACES[index % NAMESPACES.length];
    const section = `group${Math.floor(index / NAMESPACES.length) % 48}`;
    const leaf = `item${index}`;
    setNested(tree, [namespace, section, leaf], `${locale.toUpperCase()} value ${index}`);
  }

  return tree;
};

const buildAllKeys = (keyCount) => {
  const keys = [];
  for (let index = 0; index < keyCount; index += 1) {
    const namespace = NAMESPACES[index % NAMESPACES.length];
    const section = `group${Math.floor(index / NAMESPACES.length) % 48}`;
    keys.push(`${namespace}.${section}.item${index}`);
  }
  return keys;
};

const buildSourceFileContent = (keys, fileIndex) => {
  const lines = [];
  for (let offset = 0; offset < CALLS_PER_FILE; offset += 1) {
    const keyIndex = (fileIndex * 17 + offset * 7) % keys.length;
    lines.push(`  t("${keys[keyIndex]}");`);
  }

  return `export const View${fileIndex} = () => {\n${lines.join("\n")}\n  return null;\n};\n`;
};

export const createPerformanceFixtureProject = async (
  name = "gloss-perf-fixture",
  options = {},
) => {
  const keyCount =
    Number.isInteger(options.keyCount) && options.keyCount > 0
      ? options.keyCount
      : DEFAULT_KEY_COUNT;
  const fileCount =
    Number.isInteger(options.fileCount) && options.fileCount > 0
      ? options.fileCount
      : DEFAULT_FILE_COUNT;

  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  const i18nDir = path.join(rootDir, "src", "i18n");

  await fs.writeFile(
    path.join(rootDir, "gloss.config.cjs"),
    `module.exports = {
  locales: ${JSON.stringify(LOCALES)},
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
};
`,
    "utf8",
  );

  for (const locale of LOCALES) {
    await writeJson(path.join(i18nDir, `${locale}.json`), buildNestedTree(locale, keyCount));
  }

  const keys = buildAllKeys(keyCount);
  for (let index = 0; index < fileCount; index += 1) {
    const directory =
      index % 2 === 0 ?
        path.join(rootDir, "src", "pages")
      : path.join(rootDir, "src", "components");
    const fileName = index % 2 === 0 ? `Page${index}.tsx` : `Widget${index}.tsx`;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, fileName),
      buildSourceFileContent(keys, index),
      "utf8",
    );
  }

  return {
    rootDir,
    keyCount,
    locales: [...LOCALES],
    namespaces: [...NAMESPACES],
    cleanup: async () => fs.rm(rootDir, { recursive: true, force: true }),
  };
};
