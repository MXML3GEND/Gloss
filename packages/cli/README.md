# Gloss CLI

Gloss is a local-first translation editor for JSON i18n files.

## Usage

```bash
npx gloss
```

Or install as a dev dependency:

```bash
npm install -D gloss
npx gloss
```

Project script:

```json
{
  "scripts": {
    "gloss": "gloss"
  }
}
```

## Configuration

Create `gloss.config.ts` in your project root:

```ts
export default {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
  scan: {
    include: ["src/**/*.{ts,tsx,js,jsx}"],
    exclude: ["**/*.test.tsx"],
    mode: "regex", // or "ast" for strict parsing
  },
};
```

For CommonJS projects, create `gloss.config.cjs`:

```js
module.exports = {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
  scan: {
    mode: "ast",
  },
};
```

## Options

```bash
gloss --help
gloss --version
gloss --no-open
gloss --port 5179
gloss open key auth.login.title
```

## CI Guardrails

Run project checks for missing/orphan/invalid keys, placeholder mismatches, and potential hardcoded UI text:

```bash
gloss check
```

Machine-readable output:

```bash
gloss check --format json
gloss check --format both
```

`gloss check` exits with code `1` when issues are found, so it is CI-friendly.

The local UI also consumes this data through `/api/check` and shows a hardcoded-text status chip.

## Typed Key Generation

Generate `i18n-keys.d.ts` from current translation keys:

```bash
gloss gen-types
```

Use the generated `I18nKey` type in your app's `t(...)` signature to get key autocomplete while typing.

Custom output path:

```bash
gloss gen-types --out src/types/i18n-keys.d.ts
```

## Deep-Link Open

Open Gloss directly focused on a key:

```bash
gloss open key auth.login.title
```
