import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  {
    name: "mnemosyne/source",
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
  },
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);
