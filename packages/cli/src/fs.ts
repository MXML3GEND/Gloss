import fs from "node:fs/promises";
import path from "node:path";
import type { GlossConfig, TranslationsByLocale } from "@gloss/shared";

function projectRoot() {
  return process.env.INIT_CWD || process.cwd();
}

function translationsDir(cfg: GlossConfig) {
  if (path.isAbsolute(cfg.path)) {
    return cfg.path;
  }

  return path.join(projectRoot(), cfg.path);
}

function localeFile(cfg: GlossConfig, locale: string) {
  return path.join(translationsDir(cfg), `${locale}.json`);
}

export async function readAllTranslations(
  cfg: GlossConfig,
): Promise<TranslationsByLocale> {
  const out: TranslationsByLocale = {};
  for (const locale of cfg.locales) {
    const file = localeFile(cfg, locale);
    try {
      const raw = await fs.readFile(file, "utf8");
      out[locale] = JSON.parse(raw);
    } catch {
      out[locale] = {}; // start empty if missing
    }
  }
  return out;
}

export async function writeAllTranslations(
  cfg: GlossConfig,
  data: TranslationsByLocale,
) {
  const dir = translationsDir(cfg);
  await fs.mkdir(dir, { recursive: true });

  for (const locale of cfg.locales) {
    const file = localeFile(cfg, locale);
    const json = JSON.stringify(data[locale] ?? {}, null, 2) + "\n";
    await fs.writeFile(file, json, "utf8");
  }
}
