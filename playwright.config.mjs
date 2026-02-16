import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5178",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm -w @gloss/cli run dev:server",
      url: "http://127.0.0.1:5179/api/config",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm -w @gloss/ui run dev -- --host 127.0.0.1 --port 5178",
      url: "http://127.0.0.1:5178",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
