# Gloss

Gloss is a local-first CLI + web app for managing i18n translation files.

## Install

Run directly:

```bash
npx gloss
```

Or add as a dev dependency:

```bash
npm install -D @mxml3gend/gloss
npx gloss
```

Optional project script:

```json
{
  "scripts": {
    "gloss": "gloss"
  }
}
```

Then run:

```bash
npm run gloss
```

## Configuration

Create `gloss.config.ts` (ESM) in your project root:

```ts
const config = {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
  scan: {
    include: ["src/**/*.{ts,tsx,js,jsx}"],
    exclude: ["**/*.test.*", "**/*.stories.*", "**/__mocks__/**"],
    mode: "regex", // optional: "ast" for strict AST usage scanning
  },
};

export default config;
```

If your project is CommonJS, use `gloss.config.cjs`:

```js
module.exports = {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
};
```

## CLI options

```bash
gloss --help
gloss --version
gloss --no-open
gloss --port 5179
gloss check --format json
gloss gen-types --out src/types/i18n-keys.d.ts
gloss open key auth.login.title
```

## Local development

```bash
npm install
npm run check
npm run dev
```

## VS Code ergonomics

See `packages/vscode-extension` for hover previews and quick key jump support.

## License

MIT
