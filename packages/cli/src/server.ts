import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import type { GlossConfig, TranslationsByLocale } from "@gloss/shared";
import { updateIssueBaseline } from "./baseline.js";
import { runGlossCheck } from "./check.js";
import { readAllTranslations, WriteLockError, writeAllTranslations } from "./fs.js";
import { buildGitKeyDiff } from "./gitDiff.js";
import { flattenObject, unflattenObject } from "./translationTree.js";
import { buildKeyUsageMap } from "./usage.js";
import { inferUsageRoot, scanUsage } from "./usageScanner.js";
import { buildXliffDocument, parseXliffTargets } from "./xliff.js";
import { renameKeyUsage } from "./renameKeyUsage.js";

const resolveUiDistPath = () => {
  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(runtimeDir, "ui"),
    path.resolve(process.cwd(), "packages/ui/dist"),
    path.resolve(process.cwd(), "ui/dist"),
  ];

  for (const candidate of candidates) {
    const indexPath = path.join(candidate, "index.html");
    if (fs.existsSync(indexPath)) {
      return candidate;
    }
  }

  return null;
};

export function createServerApp(cfg: GlossConfig) {
  return createServerAppWithOptions(cfg);
}

type ServerRuntimeOptions = {
  useCache?: boolean;
};

const shouldBypassCache = (value: unknown) => {
  if (typeof value !== "string") {
    return false;
  }
  return value === "1" || value.toLowerCase() === "true";
};

export function createServerAppWithOptions(
  cfg: GlossConfig,
  runtimeOptions: ServerRuntimeOptions = {},
) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  const defaultUseCache = runtimeOptions.useCache !== false;
  const requestUseCache = (req: express.Request) => {
    if (!defaultUseCache) {
      return false;
    }
    const noCacheValue = req.query.noCache;
    if (Array.isArray(noCacheValue)) {
      return !noCacheValue.some((entry) => shouldBypassCache(entry));
    }
    return !shouldBypassCache(noCacheValue);
  };

  app.get("/api/config", (_req, res) => res.json(cfg));

  app.get("/api/translations", async (_req, res) => {
    const data = await readAllTranslations(cfg);
    res.json(data);
  });

  app.get("/api/usage", async (_req, res) => {
    const usage = await scanUsage(inferUsageRoot(cfg), cfg.scan, {
      useCache: requestUseCache(_req),
    });
    res.json(usage);
  });

  app.get("/api/key-usage", async (req, res) => {
    const usage = await buildKeyUsageMap(cfg, {
      useCache: requestUseCache(req),
    });
    res.json(usage);
  });

  app.get("/api/check", async (req, res) => {
    const result = await runGlossCheck(cfg, {
      useCache: requestUseCache(req),
    });
    let baseline: Awaited<ReturnType<typeof updateIssueBaseline>> | null = null;
    try {
      baseline = await updateIssueBaseline(
        process.env.INIT_CWD || process.cwd(),
        result.summary,
      );
    } catch {
      baseline = null;
    }
    const summaryValue =
      typeof req.query.summary === "string" ? req.query.summary : "";
    const summaryOnly = summaryValue === "1" || summaryValue === "true";

    if (summaryOnly) {
      res.json({
        ok: result.ok,
        generatedAt: result.generatedAt,
        summary: result.summary,
        hardcodedTexts: result.hardcodedTexts.slice(0, 20),
        baseline,
      });
      return;
    }

    res.json({ ...result, baseline });
  });

  app.get("/api/git-diff", async (req, res) => {
    const base =
      typeof req.query.base === "string" && req.query.base.trim()
        ? req.query.base.trim()
        : "origin/main";
    const diff = await buildGitKeyDiff(cfg, base);
    res.json(diff);
  });

  app.get("/api/xliff/export", async (req, res) => {
    const locale = typeof req.query.locale === "string" ? req.query.locale.trim() : "";
    const sourceLocale =
      typeof req.query.sourceLocale === "string" && req.query.sourceLocale.trim()
        ? req.query.sourceLocale.trim()
        : cfg.defaultLocale;

    if (!locale || !cfg.locales.includes(locale)) {
      res.status(400).json({
        ok: false,
        error: "Query parameter `locale` is required and must be one of configured locales.",
      });
      return;
    }

    if (!cfg.locales.includes(sourceLocale)) {
      res.status(400).json({
        ok: false,
        error:
          "Query parameter `sourceLocale` must be one of configured locales when provided.",
      });
      return;
    }

    const data = await readAllTranslations(cfg);
    const xml = buildXliffDocument({
      translations: data,
      locales: cfg.locales,
      sourceLocale,
      targetLocale: locale,
    });

    res.setHeader("Content-Type", "application/xliff+xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gloss-${locale}.xlf"`,
    );
    res.send(xml);
  });

  app.post("/api/xliff/import", async (req, res) => {
    const locale = typeof req.query.locale === "string" ? req.query.locale.trim() : "";
    if (!locale || !cfg.locales.includes(locale)) {
      res.status(400).json({
        ok: false,
        error: "Query parameter `locale` is required and must be one of configured locales.",
      });
      return;
    }

    const body = req.body as { content?: unknown };
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      res.status(400).json({
        ok: false,
        error: "Request body must include non-empty `content` string.",
      });
      return;
    }

    try {
      const parsedTargets = parseXliffTargets(body.content);
      const updates = Object.entries(parsedTargets).filter(([key]) => key.trim().length > 0);
      if (updates.length === 0) {
        res.status(400).json({
          ok: false,
          error: "No translatable units found in XLIFF content.",
        });
        return;
      }

      const data = await readAllTranslations(cfg);
      const localeFlat = flattenObject(data[locale] ?? {});

      for (const [key, value] of updates) {
        localeFlat[key] = value;
      }

      data[locale] = unflattenObject(localeFlat);
      await writeAllTranslations(cfg, data);

      res.json({
        ok: true,
        locale,
        updated: updates.length,
      });
    } catch (error) {
      if (error instanceof WriteLockError) {
        res.status(409).json({ ok: false, error: error.message });
        return;
      }

      res.status(400).json({
        ok: false,
        error: (error as Error).message || "Failed to parse XLIFF content.",
      });
    }
  });

  app.post("/api/translations", async (req, res) => {
    const data = req.body as TranslationsByLocale;
    try {
      await writeAllTranslations(cfg, data);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof WriteLockError) {
        res.status(409).json({ ok: false, error: error.message });
        return;
      }

      res.status(500).json({
        ok: false,
        error: "Failed to write translation files.",
      });
    }
  });

  app.post("/api/rename-key", async (req, res) => {
    const body = req.body as { oldKey?: unknown; newKey?: unknown };
    const oldKey = typeof body.oldKey === "string" ? body.oldKey.trim() : "";
    const newKey = typeof body.newKey === "string" ? body.newKey.trim() : "";

    if (!oldKey || !newKey) {
      res.status(400).json({
        ok: false,
        error: "oldKey and newKey are required string values.",
      });
      return;
    }

    try {
      const result = await renameKeyUsage(oldKey, newKey, undefined, cfg.scan?.mode);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: (error as Error).message,
      });
    }
  });

  const uiDistPath = resolveUiDistPath();
  if (uiDistPath) {
    app.use(express.static(uiDistPath, { index: false }));
    app.get("/", (_req, res) => {
      res.sendFile(path.join(uiDistPath, "index.html"));
    });
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(uiDistPath, "index.html"));
    });
  } else {
    console.warn("Gloss UI build not found. Run `npm -w @gloss/ui run build`.");
  }

  return app;
}

export async function startServer(
  cfg: GlossConfig,
  port = 5179,
  runtimeOptions: ServerRuntimeOptions = {},
) {
  const app = createServerAppWithOptions(cfg, runtimeOptions);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(port, () => resolve(nextServer));
  });
  const address = server.address();
  const resolvedPort =
    typeof address === "object" && address ? address.port : port;

  return { port: resolvedPort, server };
}
