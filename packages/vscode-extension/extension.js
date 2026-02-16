const vscode = require("vscode");

const KEY_CALL_REGEX = /(?:\bt|\btranslate)\(\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1\s*\)/g;

const normalizeServerUrl = (value) => {
  const next = (value || "http://localhost:5179").trim();
  return next.endsWith("/") ? next.slice(0, -1) : next;
};

const getServerUrl = () => {
  const configuration = vscode.workspace.getConfiguration("gloss");
  return normalizeServerUrl(configuration.get("serverUrl"));
};

const flattenObject = (value, prefix = "", output = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof nested === "string") {
      output[nextKey] = nested;
      continue;
    }
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      flattenObject(nested, nextKey, output);
    }
  }

  return output;
};

const findKeyAtPosition = (document, position) => {
  const source = document.getText();
  const offset = document.offsetAt(position);
  let match = KEY_CALL_REGEX.exec(source);

  while (match) {
    const fullMatch = match[0];
    const key = match[2];
    const keyStart = match.index + fullMatch.indexOf(key);
    const keyEnd = keyStart + key.length;
    if (offset >= keyStart && offset <= keyEnd) {
      KEY_CALL_REGEX.lastIndex = 0;
      return key;
    }
    match = KEY_CALL_REGEX.exec(source);
  }
  KEY_CALL_REGEX.lastIndex = 0;
  return null;
};

const fetchTranslations = async (serverUrl) => {
  const response = await fetch(`${serverUrl}/api/translations`);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload;
};

const buildHoverMarkdown = (key, byLocale, serverUrl) => {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**Gloss key** \`${key}\`\n\n`);

  const locales = Object.keys(byLocale).sort((left, right) =>
    left.localeCompare(right),
  );
  for (const locale of locales) {
    const value = byLocale[locale];
    markdown.appendMarkdown(`- **${locale}**: ${value || "_(missing)_"}\n`);
  }

  markdown.appendMarkdown(
    `\n[Open in Gloss](${serverUrl}/?key=${encodeURIComponent(key)})`,
  );
  return markdown;
};

const getKeyFromEditorSelection = (editor) => {
  if (!editor) {
    return null;
  }

  const selectionText = editor.document.getText(editor.selection).trim();
  if (selectionText) {
    return selectionText.replace(/^['"]|['"]$/g, "");
  }

  return findKeyAtPosition(editor.document, editor.selection.active);
};

function activate(context) {
  const hoverProvider = vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    {
      provideHover: async (document, position) => {
        const key = findKeyAtPosition(document, position);
        if (!key) {
          return null;
        }

        const serverUrl = getServerUrl();
        try {
          const translations = await fetchTranslations(serverUrl);
          if (!translations) {
            return new vscode.Hover(
              new vscode.MarkdownString(
                `**Gloss key** \`${key}\`\n\nGloss server unavailable at ${serverUrl}.`,
              ),
            );
          }

          const byLocale = {};
          for (const [locale, tree] of Object.entries(translations)) {
            const flat = flattenObject(tree);
            byLocale[locale] = flat[key] || "";
          }

          return new vscode.Hover(buildHoverMarkdown(key, byLocale, serverUrl));
        } catch {
          return new vscode.Hover(
            new vscode.MarkdownString(
              `**Gloss key** \`${key}\`\n\nGloss server unavailable at ${serverUrl}.`,
            ),
          );
        }
      },
    },
  );

  const openKeyCommand = vscode.commands.registerCommand(
    "gloss.openKeyInBrowser",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      const suggestedKey = getKeyFromEditorSelection(activeEditor) || "";
      const key = await vscode.window.showInputBox({
        title: "Open Gloss Key",
        prompt: "Translation key to open",
        value: suggestedKey,
      });

      const nextKey = key?.trim();
      if (!nextKey) {
        return;
      }

      const serverUrl = getServerUrl();
      const target = vscode.Uri.parse(
        `${serverUrl}/?key=${encodeURIComponent(nextKey)}`,
      );
      await vscode.env.openExternal(target);
    },
  );

  context.subscriptions.push(hoverProvider, openKeyCommand);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
