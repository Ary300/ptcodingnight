import { DomainError } from "@/lib/errors";

/**
 * The one sentence a closed student-account door answers with.
 *
 * Students enter the real contest with the join code on their slip, and nothing else. Sign-up and
 * competitor email/password sign-in both answer this, as a 410, so a stale client or a bookmarked
 * form reads where to go rather than a generic failure.
 */
export const STUDENT_ACCOUNTS_CLOSED_MESSAGE =
  "Student accounts are closed. Enter the join code on your slip at /join.";

export function studentAccountsClosed(): DomainError {
  return new DomainError("GONE", STUDENT_ACCOUNTS_CLOSED_MESSAGE);
}
