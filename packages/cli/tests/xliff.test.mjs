import assert from "node:assert/strict";
import test from "node:test";
import { buildXliffDocument, parseXliffTargets } from "../dist/xliff.js";

test("buildXliffDocument exports sorted keys with source and target", () => {
  const xml = buildXliffDocument({
    translations: {
      en: {
        auth: {
          login: {
            title: "Welcome & hello",
          },
        },
      },
      nl: {
        auth: {
          login: {
            title: "Welkom",
          },
        },
      },
    },
    locales: ["en", "nl"],
    sourceLocale: "en",
    targetLocale: "nl",
  });

  assert.match(xml, /<trans-unit id="auth\.login\.title">/);
  assert.match(xml, /<source>Welcome &amp; hello<\/source>/);
  assert.match(xml, /<target>Welkom<\/target>/);
});

test("parseXliffTargets supports xliff 1.2 trans-unit", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="nl">
    <body>
      <trans-unit id="auth.login.title">
        <source>Welcome</source>
        <target>Welkom</target>
      </trans-unit>
      <trans-unit id="auth.login.subtitle">
        <source>Sign in</source>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

  const parsed = parseXliffTargets(xml);
  assert.equal(parsed["auth.login.title"], "Welkom");
  assert.equal(parsed["auth.login.subtitle"], "Sign in");
});

test("parseXliffTargets supports xliff 2.0 units", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0">
  <file id="f1">
    <unit id="profile.greeting">
      <segment>
        <source>Hello {name}</source>
        <target>Hallo {name}</target>
      </segment>
    </unit>
  </file>
</xliff>
`;

  const parsed = parseXliffTargets(xml);
  assert.equal(parsed["profile.greeting"], "Hallo {name}");
});
