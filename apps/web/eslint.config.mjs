import tseslint from "typescript-eslint";

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@builder/config/env",
              message:
                "Do not import @builder/config/env directly in apps/web. Import from '@/server/env' to preserve the Next.js server-only guard.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/env.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
