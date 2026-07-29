# SECURITY

Accepted findings and the reasoning behind each. G11 (docs/PRD.md §12) requires zero high
or critical findings **or** an explicit documented rationale for every one that remains.

An entry here is a decision, not a backlog item. Anything that could plausibly be reached by
a student's submission does not belong on this page — it gets fixed.

---

## A1 — `brace-expansion` DoS in the ESLint toolchain (high, accepted)

**Advisory:** brace-expansion — DoS via unbounded expansion length causing an
out-of-memory process crash. CWE-400, CWE-770. Vulnerable range `<=5.0.7`.

**Where:** `eslint@9.39.5 -> minimatch@3.1.5 -> brace-expansion@1.1.16`. Reported as 9
findings because npm attributes it to every ESLint package in the chain
(`@eslint/config-array`, `@eslint/eslintrc`, `eslint-config-next`, `eslint-plugin-import`,
`eslint-plugin-jsx-a11y`, `eslint-plugin-react`, `minimatch`).

**Why it is accepted:**

1. **Not reachable at runtime.** ESLint is a devDependency. It is not imported by `app/`,
   `worker/`, or `lib/`, and it does not ship in the production image.
2. **No attacker-controlled input.** The vulnerability triggers on a malicious *glob
   pattern*. Every glob in this project is authored by us in `eslint.config.mjs`,
   `vitest*.config.ts`, and `package.json` scripts. A student's submission is source code
   handed to a sandboxed container — it never becomes a lint glob.
3. **No fix exists on the required major.** `minimatch@3` requires `brace-expansion@^1`,
   and `1.1.16` is the newest 1.x. The advisory is only fixed in `5.0.8`, whose export
   shape is incompatible with `minimatch@3` — pinning it there crashes ESLint outright
   (`TypeError: expand is not a function`), which we verified.
4. **The alternative is worse.** `npm audit fix --force` resolves this by installing
   `next@9.3.3` — a seven-major downgrade of the web framework. Trading a dev-only DoS for
   a 2020-era Next.js is a strictly larger security regression.

**What we did fix instead.** Scoped `overrides` in `package.json` patch every advisory that
*could* be reached, taking the count from 12 to 9:

| Package | Pinned to | Why it mattered |
|---|---|---|
| `postcss` | `^8.5.24` | Path traversal / arbitrary `.map` file disclosure via `sourceMappingURL`. Runs at build time on CSS we process. |
| `sharp` | `^0.35.3` | Inherited libvips CVEs (2026-33327/33328/35590/35591). Reachable through Next.js image optimization at runtime. |
| `brace-expansion` (under `minimatch@10`) | `^5.0.8` | The modern chain takes the real fix. |
| `brace-expansion` (under `minimatch@3`) | `^1.1.16` | Newest compatible 1.x — accepted above. |

**Revisit when:** ESLint drops `minimatch@3`, or a `1.1.17` backport ships. Re-run
`npm audit` at every dependency bump; this entry is only valid while the chain above holds.
