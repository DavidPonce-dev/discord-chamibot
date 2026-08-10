import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import prettierConfig from "eslint-config-prettier"

export default [
  prettierConfig,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "data/"],
  },
]
