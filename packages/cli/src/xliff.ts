import type { TranslationsByLocale } from "@gloss/shared";
import { flattenObject } from "./translationTree.js";

type BuildXliffDocumentOptions = {
  translations: TranslationsByLocale;
  locales: string[];
  sourceLocale: string;
  targetLocale: string;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const decodeXml = (value: string) =>
  value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, num: string) =>
      String.fromCodePoint(Number.parseInt(num, 10)),
    )
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const normalizeXmlText = (value: string) => {
  const cdataUnwrapped = value.replace(
    /<!\[CDATA\[([\s\S]*?)\]\]>/g,
    (_, inner: string) => inner,
  );
  const withoutTags = cdataUnwrapped.replace(/<[^>]*>/g, "");
  return decodeXml(withoutTags);
};

const readTagContent = (block: string, tag: "source" | "target") => {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = regex.exec(block);
  if (!match) {
    return "";
  }
  return normalizeXmlText(match[1]);
};

const readBlockId = (attrs: string) => {
  const match = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
  return match ? decodeXml(match[1].trim()) : "";
};

const collectBlocks = (xml: string, tagName: "trans-unit" | "unit") => {
  const regex = new RegExp(
    `<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
    "gi",
  );
  const blocks: Array<{ id: string; content: string }> = [];

  let match = regex.exec(xml);
  while (match) {
    const id = readBlockId(match[1] ?? "");
    if (id) {
      blocks.push({ id, content: match[2] ?? "" });
    }
    match = regex.exec(xml);
  }

  return blocks;
};

export const buildXliffDocument = ({
  translations,
  locales,
  sourceLocale,
  targetLocale,
}: BuildXliffDocumentOptions) => {
  const flattenedByLocale: Record<string, Record<string, string>> = {};
  for (const locale of locales) {
    flattenedByLocale[locale] = flattenObject(translations[locale] ?? {});
  }

  const keySet = new Set<string>();
  for (const values of Object.values(flattenedByLocale)) {
    for (const key of Object.keys(values)) {
      keySet.add(key);
    }
  }

  const keys = Array.from(keySet).sort((left, right) => left.localeCompare(right));
  const units = keys
    .map((key) => {
      const sourceValue = flattenedByLocale[sourceLocale]?.[key] ?? "";
      const targetValue = flattenedByLocale[targetLocale]?.[key] ?? "";
      return [
        `    <trans-unit id="${escapeXml(key)}">`,
        `      <source>${escapeXml(sourceValue)}</source>`,
        `      <target>${escapeXml(targetValue)}</target>`,
        "    </trans-unit>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xliff version="1.2">',
    `  <file source-language="${escapeXml(sourceLocale)}" target-language="${escapeXml(
      targetLocale,
    )}" datatype="plaintext" original="gloss">`,
    "  <body>",
    units,
    "  </body>",
    "  </file>",
    "</xliff>",
    "",
  ].join("\n");
};

export const parseXliffTargets = (content: string) => {
  const updates: Record<string, string> = {};
  const blocks = [...collectBlocks(content, "trans-unit"), ...collectBlocks(content, "unit")];

  for (const block of blocks) {
    const target = readTagContent(block.content, "target");
    const source = readTagContent(block.content, "source");
    const value = target.length > 0 ? target : source;
    updates[block.id] = value;
  }

  return updates;
};
