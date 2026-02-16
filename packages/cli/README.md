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
};
```

For CommonJS projects, create `gloss.config.cjs`:

```js
module.exports = {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "src/i18n",
  format: "json",
};
```

## Options

```bash
gloss --help
gloss --version
gloss --no-open
gloss --port 5179
```
