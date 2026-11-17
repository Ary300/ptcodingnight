import type { Language } from "@/lib/schemas/judge";

import { errorOutputOf, parseDiagnostics, type DiagnosticsInput, type ErrorRow } from "./diagnostics";

/**
 * Which run's errors the editor marks, decided in one pure place for the problem workspace.
 *
 * The run on screen in the Results panel is the one marked. Nothing is marked while a run is in
 * flight (the marks clear the moment the next run starts), when the editor has moved to another
 * language since, or when the code the run was sent with is unknown.
 */

export interface RunRecord {
  /** The code the run was sent with; null when the page does not know it. */
  readonly source: string | null;
  readonly language: Language | null;
  readonly compileError: string | null;
  readonly results: readonly ErrorRow[];
}

export interface RunDiagnosticsInput {
  readonly shown: "samples" | "judged" | null;
  readonly busy: boolean;
  readonly editorLanguage: Language;
  readonly samples: RunRecord;
  readonly judged: RunRecord;
}

export function runDiagnostics(input: RunDiagnosticsInput): DiagnosticsInput | null {
  if (input.shown === null || input.busy) return null;
  const run = input.shown === "samples" ? input.samples : input.judged;
  if (run.source === null || run.language !== input.editorLanguage) return null;
  const output = errorOutputOf(run.compileError, run.results);
  if (output === null) return null;
  const items = parseDiagnostics(run.language, output);
  return items.length === 0 ? null : { source: run.source, items };
}
