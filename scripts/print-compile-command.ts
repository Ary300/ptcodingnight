import { VARIANTS, type LanguageId } from "@/lib/judge/runtimes";

import { withHostMaxProcs } from "../worker/host";

/**
 * Print the exact compile command the judge writes into `compile.sh` for one language.
 *
 * Exists so `scripts/build-judge-images.sh --verify` can run the JUDGE'S command instead of a
 * hand-copied approximation of it. The two had drifted, and the drift was invisible in the worst
 * possible way: the verify check reported the Go cache as warm while running a command the judge
 * does not run, so it was measuring something nobody would ever execute.
 *
 * Host substitution is applied, because that is what the worker does too — printing the raw
 * registry string would reintroduce the same class of difference one layer down.
 *
 * Usage: npx tsx scripts/print-compile-command.ts GO_123
 */

const id = process.argv[2];

if (id === undefined) {
  console.error("usage: print-compile-command.ts <LANGUAGE_ID>");
  process.exit(2);
}

const variant = VARIANTS[id as LanguageId] as (typeof VARIANTS)[LanguageId] | undefined;

if (variant === undefined) {
  console.error(`unknown language id: ${id}`);
  console.error(`known: ${Object.keys(VARIANTS).join(", ")}`);
  process.exit(2);
}

if (variant.compileCommand === undefined) {
  console.error(`${id} is interpreted and has no compile command`);
  process.exit(2);
}

process.stdout.write(`${withHostMaxProcs(variant.compileCommand)}\n`);
