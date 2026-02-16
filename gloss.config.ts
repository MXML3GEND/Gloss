export default {
  locales: ["en", "nl"],
  defaultLocale: "en",
  path: "./src/i18n",
  scan: {
    exclude: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "**/*.test.jsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/*.spec.js",
      "**/*.spec.jsx",
      "**/*.stories.ts",
      "**/*.stories.tsx",
      "**/*.stories.js",
      "**/*.stories.jsx",
      "**/__tests__/**",
      "**/__mocks__/**",
      "**/mocks/**",
    ],
  },
};
