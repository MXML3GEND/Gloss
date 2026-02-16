#!/usr/bin/env node
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import open from "open";
import { GlossConfigError, loadGlossConfig } from "./config.js";
import { startServer } from "./server.js";

type CliOptions = {
  help: boolean;
  version: boolean;
  noOpen: boolean;
  port: number;
};

const DEFAULT_PORT = 5179;

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

Options:
  -h, --help       Show help
  -v, --version    Show version
  --no-open        Do not open browser automatically
  -p, --port       Set server port (default: ${DEFAULT_PORT})
`);
};

const parseArgs = (args: string[]): CliOptions => {
  const options: CliOptions = {
    help: false,
    version: false,
    noOpen: false,
    port: DEFAULT_PORT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

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
    if (arg === "-p" || arg === "--port") {
      const nextValue = args[index + 1];
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

  const cfg = await loadGlossConfig();
  const { port } = await startServer(cfg, options.port);

  const url = `http://localhost:${port}`;
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
