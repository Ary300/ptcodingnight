/**
 * Print the starter code a student is served for one problem, in each of its allowed languages,
 * resolved exactly as the problem page resolves it: hand-written file, then generated, then the
 * language's generic template. Usage: npx tsx scripts/print-served-starters.ts <slug> [outDir]
 * With outDir, also writes main.py / Main.java / main.cpp there for compiling.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readHandWrittenStarters, resolveStarters } from "@/lib/contest/hand-written-starters";
import { VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import { startersFor } from "@/lib/judge/starters";
import { ProblemManifestSchema } from "@/lib/schemas/seed";

async function main(): Promise<void> {
  const [slug, outDir] = process.argv.slice(2);
  if (slug === undefined) throw new Error("usage: print-served-starters.ts <slug> [outDir]");
  const manifest = ProblemManifestSchema.parse(
    JSON.parse(readFileSync(path.join("content", "problems", slug, "problem.json"), "utf8")),
  );
  const allowed: readonly LanguageId[] = manifest.allowedLanguages;
  const generated = manifest.signature === undefined ? undefined : startersFor(manifest.signature, allowed);
  const hand = await readHandWrittenStarters(slug);
  const resolved = resolveStarters(allowed, hand, generated) ?? [];
  if (outDir !== undefined) mkdirSync(outDir, { recursive: true });
  for (const language of allowed) {
    const entry = resolved.find((starter) => starter.language === language);
    const source = hand.has(language) ? "hand-written" : entry !== undefined ? "generated" : "generic template";
    const code = entry?.code ?? VARIANTS[language].starter;
    console.log(`===== ${language} (${source}) =====\n${code}`);
    if (outDir !== undefined) writeFileSync(path.join(outDir, VARIANTS[language].sourceFile), code);
  }
}

void main();
