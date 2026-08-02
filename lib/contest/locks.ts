import type { Prisma } from "@prisma/client";

/**
 * Serialize mutations that can change one contest's line-up, roster or set assignments.
 *
 * The distinct-set rule cannot be expressed as a plain database unique constraint because it is
 * conditional on `Contest.setSelection`. An advisory transaction lock gives every application
 * writer one ordering point before it reads the roster and writes the result. It is scoped to the
 * transaction and released automatically on commit or rollback.
 */
export async function lockContestMutations(
  db: Prisma.TransactionClient,
  contestId: string,
): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contestId}))`;
}

/**
 * Serialize edits to one problem with contest line-up changes that mention the same problem.
 *
 * This uses Postgres' two-integer advisory-lock key space, which is distinct from the single-key
 * space used by `lockContestMutations`. The fixed first key is a namespace; the second identifies
 * the problem. Callers locking more than one problem must sort ids first.
 */
export async function lockProblemMutations(
  db: Prisma.TransactionClient,
  problemId: string,
): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('problem'), hashtext(${problemId}))`;
}
