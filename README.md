# Gloss

Gloss is a local-first CLI + web app for managing i18n translation files.

## Install

Run directly:

```bash
npx gloss
```

Or add as a dev dependency:

```bash
npm install -D gloss
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
```

## Local development

```bash
npm install
npm run check
npm run dev
```

## License

MIT
