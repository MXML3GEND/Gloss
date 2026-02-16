import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import type { GlossConfig, TranslationsByLocale } from "@gloss/shared";
import { runGlossCheck } from "./check.js";
import { readAllTranslations, writeAllTranslations } from "./fs.js";
import { buildGitKeyDiff } from "./gitDiff.js";
import { buildKeyUsageMap } from "./usage.js";
import { inferUsageRoot, scanUsage } from "./usageScanner.js";
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
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/config", (_req, res) => res.json(cfg));

  app.get("/api/translations", async (_req, res) => {
    const data = await readAllTranslations(cfg);
    res.json(data);
  });

  app.get("/api/usage", async (_req, res) => {
    const usage = await scanUsage(inferUsageRoot(cfg), cfg.scan);
    res.json(usage);
  });

  app.get("/api/key-usage", async (_req, res) => {
    const usage = await buildKeyUsageMap(cfg);
    res.json(usage);
  });

  app.get("/api/check", async (req, res) => {
    const result = await runGlossCheck(cfg);
    const summaryValue =
      typeof req.query.summary === "string" ? req.query.summary : "";
    const summaryOnly = summaryValue === "1" || summaryValue === "true";

    if (summaryOnly) {
      res.json({
        ok: result.ok,
        generatedAt: result.generatedAt,
        summary: result.summary,
        hardcodedTexts: result.hardcodedTexts.slice(0, 20),
      });
      return;
    }

    res.json(result);
  });

  app.get("/api/git-diff", async (req, res) => {
    const base =
      typeof req.query.base === "string" && req.query.base.trim()
        ? req.query.base.trim()
        : "origin/main";
    const diff = await buildGitKeyDiff(cfg, base);
    res.json(diff);
  });

  app.post("/api/translations", async (req, res) => {
    const data = req.body as TranslationsByLocale;
    await writeAllTranslations(cfg, data);
    res.json({ ok: true });
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

export async function startServer(cfg: GlossConfig, port = 5179) {
  const app = createServerApp(cfg);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(port, () => resolve(nextServer));
  });
  const address = server.address();
  const resolvedPort =
    typeof address === "object" && address ? address.port : port;

  return { port: resolvedPort, server };
}
