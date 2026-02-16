import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServerApp } from "../dist/server.js";

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

const start = async (cfg) => {
  const app = createServerApp(cfg);
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
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

test("GET /api/usage returns key usage counts and files", async () => {
  const project = await makeTempProject("gloss-usage");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      auth: { login: { title: "Welcome" } },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      auth: { login: { title: "Welkom" } },
    });
    await fs.mkdir(path.join(project.rootDir, "src/pages"), { recursive: true });
    await fs.mkdir(path.join(project.rootDir, "src/components"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/pages/HomePage.tsx"),
      [
        "export function HomePage() {",
        "  t('auth.login.title');",
        "  t(\"auth.login.title\");",
        "  t('dashboard.cards.totalUsers');",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(project.rootDir, "src/components/AuthCard.tsx"),
      ["export function AuthCard() {", "  translate('auth.login.title');", "}", ""].join(
        "\n",
      ),
      "utf8",
    );

    const cfg = {
      locales: ["en", "nl"],
      defaultLocale: "en",
      path: "src/i18n",
      format: "json",
    };

    await withInitCwd(project.rootDir, async () => {
      const server = await start(cfg);
      try {
        const response = await fetch(`${server.baseUrl}/api/usage`);
        assert.equal(response.status, 200);
        const payload = await response.json();

        assert.equal(payload["auth.login.title"]?.count, 3);
        assert.deepEqual(payload["auth.login.title"]?.files, [
          "src/components/AuthCard.tsx",
          "src/pages/HomePage.tsx",
        ]);
        assert.equal(payload["dashboard.cards.totalUsers"]?.count, 1);
      } finally {
        await server.close();
      }
    });
  } finally {
    await project.cleanup();
  }
});

test("GET /api/key-usage returns page keys including imported component keys", async () => {
  const project = await makeTempProject("gloss-key-usage");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      home: { title: "Home" },
      panel: { cta: "Open" },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      home: { title: "Start" },
      panel: { cta: "Openen" },
    });
    await fs.mkdir(path.join(project.rootDir, "src/pages"), { recursive: true });
    await fs.mkdir(path.join(project.rootDir, "src/components"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/pages/HomePage.tsx"),
      [
        "import { Panel } from '../components/Panel';",
        "export function HomePage() {",
        "  t('home.title');",
        "  return Panel();",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(project.rootDir, "src/components/Panel.tsx"),
      ["export function Panel() {", "  return t('panel.cta');", "}", ""].join("\n"),
      "utf8",
    );

    const cfg = {
      locales: ["en", "nl"],
      defaultLocale: "en",
      path: "src/i18n",
      format: "json",
    };

    await withInitCwd(project.rootDir, async () => {
      const server = await start(cfg);
      try {
        const response = await fetch(`${server.baseUrl}/api/key-usage`);
        assert.equal(response.status, 200);
        const payload = await response.json();

        const page = payload.pages.find((entry) => entry.file === "src/pages/HomePage.tsx");
        assert.ok(page);
        assert.ok(page.keys.includes("home.title"));
        assert.ok(page.keys.includes("panel.cta"));

        const panelFile = payload.files.find(
          (entry) => entry.file === "src/components/Panel.tsx",
        );
        assert.ok(panelFile);
        assert.ok(panelFile.keys.includes("panel.cta"));
      } finally {
        await server.close();
      }
    });
  } finally {
    await project.cleanup();
  }
});

test("POST /api/rename-key updates literal usages and validates payload", async () => {
  const project = await makeTempProject("gloss-rename");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      auth: { login: { title: "Welcome" } },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      auth: { login: { title: "Welkom" } },
    });
    await fs.mkdir(path.join(project.rootDir, "src/components"), { recursive: true });
    const sourcePath = path.join(project.rootDir, "src/components/Login.tsx");
    await fs.writeFile(
      sourcePath,
      [
        "export function Login() {",
        "  t('auth.login.title');",
        "  translate(\"auth.login.title\");",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const cfg = {
      locales: ["en", "nl"],
      defaultLocale: "en",
      path: "src/i18n",
      format: "json",
    };

    await withInitCwd(project.rootDir, async () => {
      const server = await start(cfg);
      try {
        const badResponse = await fetch(`${server.baseUrl}/api/rename-key`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ oldKey: "", newKey: "x" }),
        });
        assert.equal(badResponse.status, 400);

        const response = await fetch(`${server.baseUrl}/api/rename-key`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            oldKey: "auth.login.title",
            newKey: "auth.login.heading",
          }),
        });

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.replacements, 2);
        assert.deepEqual(payload.changedFiles, ["src/components/Login.tsx"]);

        const updatedSource = await fs.readFile(sourcePath, "utf8");
        assert.ok(updatedSource.includes("auth.login.heading"));
        assert.ok(!updatedSource.includes("auth.login.title"));
      } finally {
        await server.close();
      }
    });
  } finally {
    await project.cleanup();
  }
});

test("usage scanners respect scan.exclude globs", async () => {
  const project = await makeTempProject("gloss-scan-exclude");
  try {
    await writeJson(path.join(project.rootDir, "src/i18n/en.json"), {
      auth: { login: { title: "Welcome", onlyInTest: "Fixture only" } },
    });
    await writeJson(path.join(project.rootDir, "src/i18n/nl.json"), {
      auth: { login: { title: "Welkom", onlyInTest: "Alleen test" } },
    });
    await fs.mkdir(path.join(project.rootDir, "src/pages"), { recursive: true });
    await fs.writeFile(
      path.join(project.rootDir, "src/pages/LoginPage.tsx"),
      ["export function LoginPage() {", "  t('auth.login.title');", "}", ""].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(project.rootDir, "src/pages/LoginPage.test.tsx"),
      ["export function LoginPageTest() {", "  t('auth.login.onlyInTest');", "}", ""].join(
        "\n",
      ),
      "utf8",
    );

    const cfg = {
      locales: ["en", "nl"],
      defaultLocale: "en",
      path: "src/i18n",
      format: "json",
      scan: {
        exclude: ["**/*.test.tsx"],
      },
    };

    await withInitCwd(project.rootDir, async () => {
      const server = await start(cfg);
      try {
        const usageResponse = await fetch(`${server.baseUrl}/api/usage`);
        assert.equal(usageResponse.status, 200);
        const usagePayload = await usageResponse.json();
        assert.equal(usagePayload["auth.login.title"]?.count, 1);
        assert.equal(usagePayload["auth.login.onlyInTest"], undefined);

        const keyUsageResponse = await fetch(`${server.baseUrl}/api/key-usage`);
        assert.equal(keyUsageResponse.status, 200);
        const keyUsagePayload = await keyUsageResponse.json();

        const files = keyUsagePayload.files.map((entry) => entry.file);
        assert.deepEqual(files, ["src/pages/LoginPage.tsx"]);
      } finally {
        await server.close();
      }
    });
  } finally {
    await project.cleanup();
  }
});
