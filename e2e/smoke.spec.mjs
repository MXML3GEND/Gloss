import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const enPath = join(repoRoot, "src/i18n/en.json");
const nlPath = join(repoRoot, "src/i18n/nl.json");
const targetKey = "auth.login.title";

const getValueByDotKey = (value, key) => {
  return key.split(".").reduce((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return current[segment];
  }, value);
};

let originalEn = "";
let originalNl = "";

test.beforeAll(async () => {
  originalEn = await readFile(enPath, "utf8");
  originalNl = await readFile(nlPath, "utf8");
});

test.afterAll(async () => {
  if (originalEn) {
    await writeFile(enPath, originalEn, "utf8");
  }
  if (originalNl) {
    await writeFile(nlPath, originalNl, "utf8");
  }
});

test("edit and save translation, then keep usage available", async ({
  page,
  request,
}) => {
  const uniqueValue = `Welcome back [e2e ${Date.now()}]`;

  const usageBeforeResponse = await request.get("http://127.0.0.1:5179/api/usage");
  expect(usageBeforeResponse.ok()).toBeTruthy();
  const usageBefore = await usageBeforeResponse.json();
  expect(usageBefore[targetKey]?.count ?? 0).toBeGreaterThan(0);

  await page.goto("/");
  await page
    .locator(".language-switch")
    .getByRole("button", { name: "EN", exact: true })
    .click();

  await page.getByLabel(/Filter keys|Sleutels filteren/).fill(targetKey);
  await expect(page.getByText(targetKey, { exact: true })).toBeVisible();

  const row = page.locator("tr", {
    has: page.getByText(targetKey, { exact: true }),
  });
  await expect(row.getByRole("button", { name: /^\d+$/ })).toBeVisible();

  const input = page.getByLabel(`en:${targetKey}`);
  await input.fill(uniqueValue);

  const saveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/translations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Save|Opslaan/ }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBeTruthy();

  const translationsResponse = await request.get(
    "http://127.0.0.1:5179/api/translations",
  );
  expect(translationsResponse.ok()).toBeTruthy();
  const translations = await translationsResponse.json();
  expect(getValueByDotKey(translations.en, targetKey)).toBe(uniqueValue);

  const usageAfterResponse = await request.get("http://127.0.0.1:5179/api/usage");
  expect(usageAfterResponse.ok()).toBeTruthy();
  const usageAfter = await usageAfterResponse.json();
  expect(usageAfter[targetKey]?.count ?? 0).toBeGreaterThan(0);

  await page.reload();
  await page.getByLabel(/Filter keys|Sleutels filteren/).fill(targetKey);
  await expect(page.getByLabel(`en:${targetKey}`)).toHaveValue(uniqueValue);
});
