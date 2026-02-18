#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import type { GlossConfig } from "@gloss/shared";
import open from "open";
import { resetIssueBaseline, updateIssueBaseline } from "./baseline.js";
import { clearGlossCaches, getCacheStatus } from "./cache.js";
import { printGlossCheck, runGlossCheck } from "./check.js";
import {
  GlossConfigError,
  discoverLocaleDirectoryCandidates,
  loadGlossConfig,
} from "./config.js";
import { installPreCommitHooks } from "./hooks.js";
import { startServer } from "./server.js";
import { generateKeyTypes } from "./typegen.js";

type ServeCommand = {
  command: "serve";
  help: boolean;
  version: boolean;
  noOpen: boolean;
  noCache: boolean;
  port: number;
};

type CheckCommand = {
  command: "check";
  help: boolean;
  version: boolean;
  format: "human" | "json" | "both";
  noCache: boolean;
};

type GenerateTypesCommand = {
  command: "gen-types";
  help: boolean;
  version: boolean;
  outFile?: string;
};

type OpenKeyCommand = {
  command: "open-key";
  help: boolean;
  version: boolean;
  noOpen: boolean;
  noCache: boolean;
  port: number;
  key: string;
};

type InitHooksCommand = {
  command: "init-hooks";
  help: boolean;
  version: boolean;
};

type BaselineResetCommand = {
  command: "baseline-reset";
  help: boolean;
  version: boolean;
};

type CacheStatusCommand = {
  command: "cache-status";
  help: boolean;
  version: boolean;
};

type CacheClearCommand = {
  command: "cache-clear";
  help: boolean;
  version: boolean;
};

type CliOptions =
  | ServeCommand
  | CheckCommand
  | GenerateTypesCommand
  | OpenKeyCommand
  | InitHooksCommand
  | BaselineResetCommand
  | CacheStatusCommand
  | CacheClearCommand;

const DEFAULT_PORT = 5179;
const GENERATED_CONFIG_FILE = "gloss.config.cjs";

const projectRoot = () => process.env.INIT_CWD || process.cwd();

const getVersion = async () => {
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  const raw = await fs.readFile(packagePath, "utf8");
  const pkg = JSON.parse(raw) as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
};

const printHelp = () => {
  console.log(`Gloss

Usage:
  gloss [options]
  gloss check [options]
  gloss gen-types [options]
  gloss init-hooks [options]
  gloss baseline reset
  gloss cache status
  gloss cache clear
  gloss open key <translation-key> [options]

Options:
  -h, --help                 Show help
  -v, --version              Show version

Serve options:
  --no-open                  Do not open browser automatically
  --no-cache                 Bypass scanner caches for API responses
  -p, --port                 Set server port (default: ${DEFAULT_PORT})

Check options:
  --format <human|json|both> Output format (default: human)
  --json                     Shortcut for --format json
  --no-cache                 Force full rescan without reading/writing scanner cache

Type generation options:
  --out <path>               Output file for generated key types (default: i18n-keys.d.ts)

Hook options:
  gloss init-hooks           Install pre-commit hooks for gloss check

Baseline options:
  gloss baseline reset       Remove the local issue baseline (.gloss/baseline.json)

Cache options:
  gloss cache status         Show scanner cache status
  gloss cache clear          Clear in-memory scanner cache and .gloss/cache-metrics.json

Open key options:
  gloss open key <key>       Open Gloss focused on a translation key
  --no-cache                 Bypass scanner caches while serving
`);
};

const parseArgs = (args: string[]): CliOptions => {
  const firstArg = args[0];
  if (firstArg === "baseline") {
    const commandArgs = args.slice(1);
    const options: BaselineResetCommand = {
      command: "baseline-reset",
      help: false,
      version: false,
    };

    for (const arg of commandArgs) {
      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg === "-v" || arg === "--version") {
        options.version = true;
        continue;
      }
      if (arg === "reset") {
        continue;
      }
      throw new Error(`Unknown argument for gloss baseline: ${arg}`);
    }

    if (!options.help && commandArgs[0] !== "reset") {
      throw new Error("Usage: gloss baseline reset");
    }

    return options;
  }

  if (firstArg === "cache") {
    const commandArgs = args.slice(1);
    const action = commandArgs[0];
    const restArgs = commandArgs.slice(1);

    if (action !== "status" && action !== "clear") {
      throw new Error("Usage: gloss cache <status|clear>");
    }

    const options: CacheStatusCommand | CacheClearCommand = {
      command: action === "status" ? "cache-status" : "cache-clear",
      help: false,
      version: false,
    };

    for (const arg of restArgs) {
      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg === "-v" || arg === "--version") {
        options.version = true;
        continue;
      }
      throw new Error(`Unknown argument for gloss cache: ${arg}`);
    }

    return options;
  }

  if (firstArg === "open") {
    const commandArgs = args.slice(1);
    const base = { help: false, version: false };
    const options: OpenKeyCommand = {
      command: "open-key",
      ...base,
      noOpen: false,
      noCache: false,
      port: DEFAULT_PORT,
      key: "",
    };

    if (commandArgs.length === 0) {
      throw new Error("Usage: gloss open key <translation-key> [--port <number>]");
    }
    if (commandArgs[0] === "-h" || commandArgs[0] === "--help") {
      options.help = true;
      return options;
    }
    if (commandArgs[0] === "-v" || commandArgs[0] === "--version") {
      options.version = true;
      return options;
    }

    let index = 0;
    if (commandArgs[0] === "key") {
      index = 1;
    }

    const keyValue = commandArgs[index];
    if (!keyValue || keyValue.startsWith("-")) {
      throw new Error("Missing translation key. Usage: gloss open key <translation-key>");
    }
    options.key = keyValue.trim();
    index += 1;

    for (; index < commandArgs.length; index += 1) {
      const arg = commandArgs[index];
      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg === "-v" || arg === "--version") {
        options.version = true;
        continue;
      }
      if (arg === "--no-open") {
        options.noOpen = true;
        continue;
      }
      if (arg === "--no-cache") {
        options.noCache = true;
        continue;
      }
      if (arg === "-p" || arg === "--port") {
        const nextValue = commandArgs[index + 1];
        if (!nextValue) {
          throw new Error("Missing value for --port.");
        }
        const parsed = Number.parseInt(nextValue, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("Port must be a positive integer.");
        }
        options.port = parsed;
        index += 1;
        continue;
      }

      throw new Error(`Unknown argument for gloss open: ${arg}`);
    }

    return options;
  }

  const isCommand = firstArg && !firstArg.startsWith("-");
  const command =
    firstArg === "check" || firstArg === "gen-types" || firstArg === "init-hooks"
      ? firstArg
      : "serve";
  const commandArgs = command === "serve" ? args : args.slice(1);

  const base = {
    help: false,
    version: false,
  };

  if (command === "check") {
    const options: CheckCommand = {
      command,
      ...base,
      format: "human",
      noCache: false,
    };

    for (let index = 0; index < commandArgs.length; index += 1) {
      const arg = commandArgs[index];

      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg === "-v" || arg === "--version") {
        options.version = true;
        continue;
      }
      if (arg === "--json") {
        options.format = "json";
        continue;
      }
      if (arg === "--no-cache") {
        options.noCache = true;
        continue;
      }
      if (arg === "--format") {
        const nextValue = commandArgs[index + 1];
        if (!nextValue) {
          throw new Error("Missing value for --format.");
        }
        if (nextValue !== "human" && nextValue !== "json" && nextValue !== "both") {
          throw new Error("Invalid value for --format. Use human, json, or both.");
        }
        options.format = nextValue;
        index += 1;
        continue;
      }

      throw new Error(`Unknown argument for gloss check: ${arg}`);
    }

    return options;
  }

  if (command === "gen-types") {
    const options: GenerateTypesCommand = {
      command,
      ...base,
    };

    for (let index = 0; index < commandArgs.length; index += 1) {
      const arg = commandArgs[index];

      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg === "-v" || arg === "--version") {
        options.version = true;
        continue;
      }
      if (arg === "--out") {
        const nextValue = commandArgs[index + 1];
        if (!nextValue) {
          throw new Error("Missing value for --out.");
        }
        options.outFile = nextValue;
        index += 1;
        continue;
      }

      throw new Error(`Unknown argument for gloss gen-types: ${arg}`);
    }

    return options;
  }

  if (command === "init-hooks") {
    const options: InitHooksCommand = {
      command,
      ...base,
    };

    for (const arg of commandArgs) {
      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg === "-v" || arg === "--version") {
        options.version = true;
        continue;
      }
      throw new Error(`Unknown argument for gloss init-hooks: ${arg}`);
    }

    return options;
  }

  if (isCommand && command === "serve" && firstArg !== undefined) {
    throw new Error(`Unknown command: ${firstArg}`);
  }

  const options: ServeCommand = {
    command: "serve",
    ...base,
    noOpen: false,
    noCache: false,
    port: DEFAULT_PORT,
  };

  for (let index = 0; index < commandArgs.length; index += 1) {
    const arg = commandArgs[index];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      options.version = true;
      continue;
    }
    if (arg === "--no-open") {
      options.noOpen = true;
      continue;
    }
    if (arg === "--no-cache") {
      options.noCache = true;
      continue;
    }
    if (arg === "-p" || arg === "--port") {
      const nextValue = commandArgs[index + 1];
      if (!nextValue) {
        throw new Error("Missing value for --port.");
      }
      const parsed = Number.parseInt(nextValue, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Port must be a positive integer.");
      }
      options.port = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const printConfigError = (error: GlossConfigError) => {
  if (error.code === "MISSING_CONFIG") {
    console.error("Gloss could not start: config file was not found.");
    console.error(
      "Create one of: gloss.config.ts, gloss.config.mts, gloss.config.js, gloss.config.mjs, gloss.config.cjs.",
    );
    return;
  }

  if (error.code === "NO_LOCALES") {
    console.error("Gloss could not start: no locales are configured.");
    console.error("Set `locales: [\"en\", ...]` or place locale JSON files in your configured path.");
    console.error(error.message);
    return;
  }

  console.error("Gloss could not start: invalid gloss.config.ts.");
  console.error(error.message);
};

const renderGeneratedConfig = (candidatePath: string, locales: string[]) => {
  const defaultLocale = locales.includes("en") ? "en" : locales[0] ?? "en";
  const localeList = locales.map((locale) => JSON.stringify(locale)).join(", ");
  const pathLiteral = JSON.stringify(candidatePath);

  return `module.exports = {
  locales: [${localeList}],
  defaultLocale: ${JSON.stringify(defaultLocale)},
  path: ${pathLiteral},
  format: "json",
};
`;
};

const chooseCandidateInteractive = async (
  candidates: Awaited<ReturnType<typeof discoverLocaleDirectoryCandidates>>,
) => {
  if (candidates.length === 1) {
    return candidates[0];
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return candidates[0];
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("Gloss setup: multiple locale directories were found.");
    candidates.forEach((candidate, index) => {
      const marker = index === 0 ? " (recommended)" : "";
      console.log(
        `  ${index + 1}. ${candidate.path} -> [${candidate.locales.join(", ")}]${marker}`,
      );
    });

    while (true) {
      const answer = (
        await rl.question(`Choose a locale directory [1-${candidates.length}] (default 1): `)
      ).trim();
      if (!answer) {
        return candidates[0];
      }

      const selection = Number.parseInt(answer, 10);
      if (Number.isFinite(selection) && selection >= 1 && selection <= candidates.length) {
        return candidates[selection - 1];
      }

      console.log(`Please enter a number between 1 and ${candidates.length}.`);
    }
  } finally {
    rl.close();
  }
};

const bootstrapConfigIfMissing = async () => {
  const cwd = projectRoot();
  const candidates = await discoverLocaleDirectoryCandidates(cwd);
  if (candidates.length === 0) {
    return false;
  }

  console.log("No Gloss config found. Starting first-run setup.");
  const selected = await chooseCandidateInteractive(candidates);

  const configFilePath = path.join(cwd, GENERATED_CONFIG_FILE);
  const content = renderGeneratedConfig(selected.path, selected.locales);
  await fs.writeFile(configFilePath, content, "utf8");

  console.log(`Created ${GENERATED_CONFIG_FILE} using ${selected.path}.`);
  console.log("Starting Gloss with the generated config.");
  return true;
};

const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatAge = (ageMs: number | null) => {
  if (ageMs === null) {
    return "n/a";
  }
  const totalSeconds = Math.max(0, Math.floor(ageMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    console.log(await getVersion());
    return;
  }

  if (options.command === "init-hooks") {
    const result = await installPreCommitHooks(projectRoot());
    console.log("Gloss hook installation");
    for (const message of result.messages) {
      console.log(`- ${message}`);
    }
    return;
  }

  if (options.command === "baseline-reset") {
    const result = await resetIssueBaseline(projectRoot());
    if (result.existed) {
      console.log(`Removed baseline at ${result.baselinePath}`);
    } else {
      console.log(`No baseline found at ${result.baselinePath}`);
    }
    return;
  }

  if (options.command === "cache-clear") {
    const result = await clearGlossCaches(projectRoot());
    console.log("Gloss cache clear");
    console.log(
      `- Usage scanner cache: ${result.usage.fileCount} files across ${result.usage.bucketCount} buckets removed`,
    );
    console.log(
      `- Key usage cache: ${result.keyUsage.fileCount} files across ${result.keyUsage.bucketCount} buckets removed`,
    );
    console.log(
      `- Cache metrics file: ${result.metrics.existed ? "removed" : "not found"} (${result.metrics.path})`,
    );
    return;
  }

  let cfg: GlossConfig;
  try {
    cfg = await loadGlossConfig();
  } catch (error) {
    if (error instanceof GlossConfigError && error.code === "MISSING_CONFIG") {
      const generated = await bootstrapConfigIfMissing();
      if (generated) {
        cfg = await loadGlossConfig();
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  if (options.command === "check") {
    const result = await runGlossCheck(cfg, {
      useCache: !options.noCache,
    });
    let baseline:
      | Awaited<ReturnType<typeof updateIssueBaseline>>
      | undefined;
    try {
      baseline = await updateIssueBaseline(projectRoot(), result.summary);
    } catch (error) {
      console.error(
        `Warning: failed to update issue baseline: ${(error as Error).message}`,
      );
    }
    printGlossCheck(result, options.format, baseline);
    if (!result.ok) {
      process.exit(1);
    }
    return;
  }

  if (options.command === "cache-status") {
    const status = await getCacheStatus(projectRoot(), cfg);
    console.log("Gloss cache status");
    console.log(
      `- Metrics file: ${status.metricsFileFound ? "found" : "not found"}${
        status.metricsUpdatedAt ? ` (updated ${status.metricsUpdatedAt})` : ""
      }`,
    );
    console.log(
      `- Total cached files: ${status.totalCachedFiles} (${formatBytes(status.totalCachedSizeBytes)})`,
    );
    console.log(`- Oldest cache entry age: ${formatAge(status.oldestEntryAgeMs)}`);
    console.log(
      `- Stale relative to config: ${status.staleRelativeToConfig ? "yes" : "no"}`,
    );
    console.log(
      `- Usage scanner: ${status.usageScanner.fileCount} files, ${formatBytes(
        status.usageScanner.totalSizeBytes,
      )}, source=${status.usageScanner.source}`,
    );
    console.log(
      `- Key usage: ${status.keyUsage.fileCount} files, ${formatBytes(
        status.keyUsage.totalSizeBytes,
      )}, source=${status.keyUsage.source}`,
    );
    return;
  }

  if (options.command === "gen-types") {
    const result = await generateKeyTypes(cfg, { outFile: options.outFile });
    console.log(`Generated ${result.keyCount} keys in ${result.outFile}`);
    return;
  }

  const { port } = await startServer(cfg, options.port, {
    useCache: !options.noCache,
  });
  const url =
    options.command === "open-key"
      ? `http://localhost:${port}/?key=${encodeURIComponent(options.key)}`
      : `http://localhost:${port}`;
  console.log(`Gloss running at ${url}`);

  if (options.noOpen || process.env.CI) {
    return;
  }

  try {
    await open(url);
  } catch (error) {
    console.error(
      `Could not open browser automatically: ${(error as Error).message}`,
    );
    console.error(`Open ${url} manually.`);
  }
}

main().catch((e) => {
  if (e instanceof GlossConfigError) {
    printConfigError(e);
    process.exit(1);
  }

  console.error(e instanceof Error ? e.message : String(e));
  printHelp();
  process.exit(1);
});
