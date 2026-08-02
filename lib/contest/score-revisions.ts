import type { Verdict } from "@/lib/schemas/judge";
import type { Db } from "@/lib/contest/audit";

/** The mutable Submission fields mirrored by the append-only temporal log. */
export interface CurrentScoreState {
  readonly id: string;
  readonly verdict: Verdict | null;
  readonly score: number;
  readonly effectiveAt: Date | null;
  readonly judgedAt: Date | null;
  readonly submittedAt: Date;
}

/**
 * Bridge a row written by an older process during a rolling deployment.
 *
 * New writers append a revision with every score change. An old process may still leave only the
 * current Submission value, though. If the first new-process action immediately appends an
 * override or rejudge tombstone, standings stop using the compatibility fallback and an earlier
 * freeze has no revision from which to recover the old answer. Capture the current answer first.
 *
 * Comparing with the latest revision, rather than only checking whether any revision exists,
 * also covers an old process overwriting a row after a new revision was already present.
 */
export async function preserveCurrentScoreRevision(
  db: Db,
  current: CurrentScoreState,
): Promise<void> {
  if (current.verdict === null) return;

  const effectiveAt =
    current.effectiveAt ?? current.judgedAt ?? current.submittedAt;
  const latest = await db.submissionScoreRevision.findFirst({
    where: { submissionId: current.id },
    orderBy: { id: "desc" },
    select: { verdict: true, score: true, effectiveAt: true },
  });

  if (
    latest?.verdict === current.verdict &&
    latest.score === current.score &&
    latest.effectiveAt.getTime() === effectiveAt.getTime()
  ) {
    return;
  }

  await db.submissionScoreRevision.create({
    data: {
      submissionId: current.id,
      verdict: current.verdict,
      score: current.score,
      effectiveAt,
    },
  });
}
