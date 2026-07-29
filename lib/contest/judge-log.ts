import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { JudgeResultSchema, type JudgeResult } from "@/lib/schemas/judge";

/**
 * Retained judge logs.
 *
 * docs/PRD.md §10 asks for a structured judge log per submission, kept for dispute resolution,
 * and `Submission.judgeLogRef` is the pointer to it. This is that store.
 *
 * It also solves a smaller problem: compiler stderr. `CE` returns the compiler's message to the
 * student verbatim (PRD §7.2), but `Submission` has no column for it — so the log is where it
 * lives, and `readCompileError` is the only thing that reads it back out.
 *
 * **Request to the orchestrator:** a `compileError String?` column on `Submission` would make
 * this a one-field read instead of a file open on the verdict path.
 *
 * Logs live under `.judge-tmp/logs/`, which is already gitignored (G12 wants a clean tree) and
 * which the worker only ever prunes its own `job-*` workspaces from.
 */

const LOG_DIR = path.join(process.cwd(), ".judge-tmp", "logs");

/** Filenames are derived from ids we generated, but a stored ref is still checked before use. */
function safeName(submissionId: string): string {
  return submissionId.replaceAll(/[^a-zA-Z0-9_-]/g, "");
}

export function judgeLogRefFor(submissionId: string): string {
  return path.posix.join(".judge-tmp", "logs", `${safeName(submissionId)}.json`);
}

/**
 * Persist the judge's own account of a submission. Returns the ref to store, or null if the
 * write failed — a lost log must never cost a student their verdict.
 */
export async function writeJudgeLog(result: JudgeResult): Promise<string | null> {
  const name = safeName(result.submissionId);
  if (name === "") return null;

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await writeFile(path.join(LOG_DIR, `${name}.json`), JSON.stringify(result), "utf8");
    return judgeLogRefFor(result.submissionId);
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "judge.log.write_failed",
        submissionId: result.submissionId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

/**
 * Read the compile error out of a retained log.
 *
 * The filename is derived from the submission id rather than from the stored ref: a ref is a
 * column, and a column is data. Deriving it means no string from the database is ever turned
 * into a path, so there is nothing to traverse with.
 *
 * Only `compileError` is ever returned. The log also holds per-test detail, and handing that
 * back wholesale is precisely how hidden test data reaches a client — so this function narrows
 * to the one field that is safe by construction.
 */
export async function readCompileError(
  submissionId: string,
  ref: string | null,
): Promise<string | null> {
  if (ref === null || ref === "") return null;

  const name = safeName(submissionId);
  if (name === "") return null;
  const resolved = path.join(LOG_DIR, `${name}.json`);

  try {
    const parsed = JudgeResultSchema.safeParse(
      JSON.parse(await readFile(resolved, "utf8")) as unknown,
    );
    return parsed.success ? parsed.data.compileError : null;
  } catch {
    // A missing or unreadable log is a degraded verdict panel, not a failed request.
    return null;
  }
}
