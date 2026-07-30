import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Judge fixtures are student submissions, and most of them are WRONG ON PURPOSE — the CE
    // cases do not parse at all, and the TLE cases are infinite loops with unused variables.
    // Linting them is a category error: eslint's job is our code, and every finding here would
    // be a fixture doing exactly what it exists to do. Fixing them to satisfy the linter would
    // destroy the suite.
    //
    // The judge itself is what validates these, in tests/judge/verdicts.test.ts.
    "fixtures/**",
  ]),
]);

export default eslintConfig;
