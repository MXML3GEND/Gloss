# Contributing to Gloss

## Setup

```bash
npm install
npm run check
```

## Development

- Run CLI + API:
  - `npm run dev`
- Run UI only:
  - `npm -w @gloss/ui run dev`
- Run CLI tests:
  - `npm -w gloss run test`

## Pull requests

- Keep changes focused and small.
- Add or update tests when behavior changes.
- Ensure `npm run check` passes before opening a PR.

## Commit style

- Use clear commit messages with scope, for example:
  - `cli: add --help and --version flags`
  - `ui: improve filter toolbar layout`
