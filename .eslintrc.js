const { resolve } = require("node:path");

const project = resolve(__dirname, "tsconfig.json");

module.exports = {
  root: true,
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:tailwindcss/recommended",
    "prettier",
  ],
  parserOptions: {
    project,
    tsconfigRootDir: __dirname,
  },
  settings: {
    tailwindcss: {
      callees: ["cn", "clsx"],
    },
  },
  rules: {
    "no-console": 1,
    "@typescript-eslint/no-unused-vars": [1, { argsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": [
      1,
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "tailwindcss/no-custom-classname": 0,
  },
};
