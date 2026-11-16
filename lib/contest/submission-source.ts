import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { SubmissionSource } from "@/lib/schemas/api";
import { canReadSubmission, type Viewer } from "@/lib/contest/viewer";

/**
 * The source of one submission, for the student who sent it (or an organizer).
 *
 * A returning student used to open a problem they had already solved and find the starter
 * template under a "Solved" badge, because drafts lived only in the tab that typed them. The
 * workspace now reads the last submitted code back from here when there is no draft.
 *
 * Same rule as the verdict read: the owner or an organizer, nobody else, and a submission that
 * cannot be read is reported as not found rather than forbidden, so an id read off somebody's
 * screen confirms nothing. Teammates are not owners: one student never receives another's code.
 */
export async function getSubmissionSource(
  submissionId: string,
  viewer: Viewer,
): Promise<SubmissionSource> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      participantId: true,
      contestProblemId: true,
      language: true,
      sourceCode: true,
    },
  });
  if (submission === null || !canReadSubmission(viewer, submission.participantId)) {
    throw new NotFoundError("Submission");
  }

  return {
    submissionId: submission.id,
    contestProblemId: submission.contestProblemId,
    language: submission.language,
    sourceCode: submission.sourceCode,
  };
}
