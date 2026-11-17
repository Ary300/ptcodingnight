import type { SubmissionView } from "@/lib/schemas/api";

/**
 * The rows the submissions list shows: what the list route returned, joined with what the verdict
 * stream has delivered since.
 *
 * The problem page's "My submissions" tab fetches the list once when it opens. A submission made
 * after that, or a verdict that lands after it, reaches the page through the verdict stream and
 * nowhere else, so the stream's copies are merged in rather than triggering another list read.
 *
 * ## Which copy wins when both have a row
 *
 * A judged copy beats an unjudged one, whichever side it came from, so a list read that was taken
 * while judging never paints "Judging" over a verdict the stream has already delivered. When both
 * are judged the LIST wins, because it was read from the database and an organizer's override is
 * only visible there; the stream's copy is the judge's word at the time it finished. When neither
 * is judged the stream's copy wins, because it is the one carrying a queue position.
 *
 * Pure and immutable: the inputs are never modified, and the output is a new array.
 */
export function mergeLiveSubmissions(
  fetched: readonly SubmissionView[],
  live: readonly SubmissionView[],
): readonly SubmissionView[] {
  const byId = new Map<string, SubmissionView>();
  for (const row of fetched) byId.set(row.submissionId, row);

  for (const streamed of live) {
    const listed = byId.get(streamed.submissionId);
    if (listed === undefined) {
      byId.set(streamed.submissionId, streamed);
      continue;
    }
    const streamedJudged = streamed.verdict !== null;
    const listedJudged = listed.verdict !== null;
    if (streamedJudged && !listedJudged) byId.set(streamed.submissionId, streamed);
    else if (!streamedJudged && !listedJudged) byId.set(streamed.submissionId, streamed);
  }

  return [...byId.values()].sort(newestFirst);
}

/** Newest first, with the id as the tie-break so equal timestamps keep one order on every render. */
function newestFirst(a: SubmissionView, b: SubmissionView): number {
  const byTime = Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  return a.submissionId < b.submissionId ? 1 : a.submissionId > b.submissionId ? -1 : 0;
}

/** Only the rows for one contest problem, or every row when no problem is named. */
export function forProblem(
  rows: readonly SubmissionView[],
  contestProblemId: string | null,
): readonly SubmissionView[] {
  return contestProblemId === null
    ? rows
    : rows.filter((row) => row.contestProblemId === contestProblemId);
}

/**
 * The stream's latest copy added to the ones already seen this session, newest first.
 *
 * The verdict stream follows ONE submission at a time, so a student who submits twice while the
 * tab is open would otherwise lose the first one's final verdict from view when the stream moves
 * on to the second.
 */
export function rememberStreamed(
  seen: readonly SubmissionView[],
  latest: SubmissionView,
): readonly SubmissionView[] {
  return [latest, ...seen.filter((row) => row.submissionId !== latest.submissionId)];
}
