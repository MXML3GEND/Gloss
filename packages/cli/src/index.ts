#!/usr/bin/env node
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import open from "open";
import { printGlossCheck, runGlossCheck } from "./check.js";
import { GlossConfigError, loadGlossConfig } from "./config.js";
import { startServer } from "./server.js";
import { generateKeyTypes } from "./typegen.js";

type ServeCommand = {
  command: "serve";
  help: boolean;
  version: boolean;
  noOpen: boolean;
  port: number;
};

type CheckCommand = {
  command: "check";
  help: boolean;
  version: boolean;
  format: "human" | "json" | "both";
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
  port: number;
  key: string;
};

type CliOptions =
  | ServeCommand
  | CheckCommand
  | GenerateTypesCommand
  | OpenKeyCommand;

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
  gloss check [options]
  gloss gen-types [options]
  gloss open key <translation-key> [options]

Options:
  -h, --help                 Show help
  -v, --version              Show version

Serve options:
  --no-open                  Do not open browser automatically
  -p, --port                 Set server port (default: ${DEFAULT_PORT})

Check options:
  --format <human|json|both> Output format (default: human)
  --json                     Shortcut for --format json

Type generation options:
  --out <path>               Output file for generated key types (default: i18n-keys.d.ts)

Open key options:
  gloss open key <key>       Open Gloss focused on a translation key
`);
};

const parseArgs = (args: string[]): CliOptions => {
  const firstArg = args[0];
  if (firstArg === "open") {
    const commandArgs = args.slice(1);
    const base = { help: false, version: false };
    const options: OpenKeyCommand = {
      command: "open-key",
      ...base,
      noOpen: false,
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
    firstArg === "check" || firstArg === "gen-types" ? firstArg : "serve";
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

  if (isCommand && command === "serve" && firstArg !== undefined) {
    throw new Error(`Unknown command: ${firstArg}`);
  }

  const options: ServeCommand = {
    command: "serve",
    ...base,
    noOpen: false,
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

  if (options.command === "check") {
    const result = await runGlossCheck(cfg);
    printGlossCheck(result, options.format);
    if (!result.ok) {
      process.exit(1);
    }
    return;
  }

  if (options.command === "gen-types") {
    const result = await generateKeyTypes(cfg, { outFile: options.outFile });
    console.log(`Generated ${result.keyCount} keys in ${result.outFile}`);
    return;
  }

  const { port } = await startServer(cfg, options.port);
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
