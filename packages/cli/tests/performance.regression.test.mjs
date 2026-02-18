import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPerformanceFixtureProject } from "./fixtures/perfFixture.mjs";

const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const baselinePath = fileURLToPath(
  new URL("./fixtures/perf-baseline.json", import.meta.url),
);

const parsePositiveNumber = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const runCliTimed = (rootDir, args) => {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, INIT_CWD: rootDir },
    encoding: "utf8",
  });
  const ended = process.hrtime.bigint();
  const durationMs = Number(ended - started) / 1_000_000;
  return { ...result, durationMs };
};

const loadBaseline = async () => {
  const raw = await fs.readFile(baselinePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    allowedRegressionRatio: parsePositiveNumber(parsed.allowedRegressionRatio, 1.2),
    baselineMs: {
      coldCheck: parsePositiveNumber(parsed?.baselineMs?.coldCheck, 4000),
      warmCheck: parsePositiveNumber(parsed?.baselineMs?.warmCheck, 2800),
    },
  };
};

test(
  "1000-key fixture stays within perf budget and cache stays faster than cold path",
  { timeout: 120_000 },
  async () => {
    const fixture = await createPerformanceFixtureProject();
    const baseline = await loadBaseline();

    try {
      const coldRun = runCliTimed(fixture.rootDir, ["check", "--json", "--no-cache"]);
      assert.equal(coldRun.status, 0, coldRun.stderr || coldRun.stdout);

      const warmRun = runCliTimed(fixture.rootDir, ["check", "--json"]);
      assert.equal(warmRun.status, 0, warmRun.stderr || warmRun.stdout);

      const warmRunSecond = runCliTimed(fixture.rootDir, ["check", "--json"]);
      assert.equal(warmRunSecond.status, 0, warmRunSecond.stderr || warmRunSecond.stdout);

      const coldPayload = JSON.parse(coldRun.stdout);
      const warmPayload = JSON.parse(warmRunSecond.stdout);
      assert.equal(coldPayload.summary.missingTranslations, 0);
      assert.equal(warmPayload.summary.missingTranslations, 0);

      const maxColdMs =
        parsePositiveNumber(
          process.env.GLOSS_PERF_COLD_MAX_MS,
          baseline.baselineMs.coldCheck * baseline.allowedRegressionRatio,
        );
      const maxWarmMs =
        parsePositiveNumber(
          process.env.GLOSS_PERF_WARM_MAX_MS,
          baseline.baselineMs.warmCheck * baseline.allowedRegressionRatio,
        );

      assert.ok(
        coldRun.durationMs <= maxColdMs,
        `Cold check ${coldRun.durationMs.toFixed(1)}ms exceeded budget ${maxColdMs.toFixed(
          1,
        )}ms`,
      );

      assert.ok(
        warmRunSecond.durationMs <= maxWarmMs,
        `Warm check ${warmRunSecond.durationMs.toFixed(1)}ms exceeded budget ${maxWarmMs.toFixed(
          1,
        )}ms`,
      );

      assert.ok(
        warmRunSecond.durationMs <= coldRun.durationMs,
        `Expected warm check (${warmRunSecond.durationMs.toFixed(
          1,
        )}ms) to be <= cold check (${coldRun.durationMs.toFixed(1)}ms)`,
      );

      console.log(
        [
          "[perf-gate]",
          `cold=${coldRun.durationMs.toFixed(1)}ms`,
          `warm1=${warmRun.durationMs.toFixed(1)}ms`,
          `warm2=${warmRunSecond.durationMs.toFixed(1)}ms`,
          `maxCold=${maxColdMs.toFixed(1)}ms`,
          `maxWarm=${maxWarmMs.toFixed(1)}ms`,
        ].join(" "),
      );
    } finally {
      await fixture.cleanup();
    }
  },
);
