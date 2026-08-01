import type { ContestPhase, ContestPhaseName } from "@/components/contest/lobby/phase";
import { prisma } from "@/lib/db";
import { assertCanReadProblems, assertCanSubmit } from "@/lib/contest/gate";
import { viewerFromCookies } from "@/lib/contest/viewer";

/**
 * The contest window, read on the server so the lobby can draw a real pre-start screen.
 *
 * ## Why this is a server read and not another API route
 *
 * Three reasons, in order of weight.
 *
 * 1. **It has to be in the first paint.** A countdown that arrives one request after the page
 *    starts at `--:--:--` and then jumps, and this is the screen a student sits in front of for
 *    twenty minutes waiting for the gun. The page is already a server component, and the cookie is
 *    already readable from it (`viewerFromCookies`).
 * 2. **No existing route carries it.** `GET /api/auth/session` returns an identity;
 *    `.../standings` returns a board and an `endsAt`; the SSE `contest-state` frame returns a state
 *    and an `endsAt`. The contest's NAME and its `startsAt` are not on any competitor-reachable
 *    response, and those two are precisely what a pre-start screen is made of.
 * 3. `app/api/**` belongs to another agent this phase. Adding a route there to feed one screen
 *    would be two people editing the same surface for one prop.
 *
 * ## Why it asks the gate instead of restating it
 *
 * `submissionsOpen` and `statementsOpen` come from calling `lib/contest/gate.ts`'s own assertions
 * and recording whether they threw. Nothing here re-implements "RUNNING or FROZEN, and inside the
 * window" — the whole job of this screen is telling a student what they may do, and a second copy
 * of that rule is a second thing to get wrong. Using an assertion as a predicate is deliberate:
 * the gate exposes no boolean for either question, and inventing one would have meant editing
 * `gate.ts`, which is not this task's to edit. See the report note on `canSubmit`/`canReadProblems`
 * predicates.
 *
 * Returning `null` means "there is no competitor session here" — an anonymous visitor or an
 * organizer. The lobby draws its sign-in state for that and never sees a phase.
 */
export async function loadContestPhase(): Promise<ContestPhase | null> {
  const now = new Date();
  const viewer = await viewerFromCookies(now);
  if (viewer.kind !== "competitor") return null;

  const contest = await prisma.contest.findUnique({
    where: { id: viewer.contestId },
    select: { id: true, name: true, state: true, startsAt: true, endsAt: true, freezeAt: true },
  });
  if (contest === null) return null;

  const participant = await prisma.participant.findFirst({
    where: { id: viewer.participantId, contestId: contest.id },
    select: {
      chosenSet: { select: { label: true } },
      team: { select: { name: true, _count: { select: { members: true } } } },
    },
  });

  let submissionsOpen = true;
  try {
    assertCanSubmit(contest, now);
  } catch {
    submissionsOpen = false;
  }

  let statementsOpen = true;
  try {
    assertCanReadProblems(contest.state);
  } catch {
    statementsOpen = false;
  }

  return {
    contestId: contest.id,
    name: contest.name,
    phase: phaseOf(contest, now),
    startsAt: contest.startsAt.toISOString(),
    endsAt: contest.endsAt.toISOString(),
    serverTime: now.toISOString(),
    submissionsOpen,
    statementsOpen,
    teamName: participant?.team?.name ?? null,
    /*
      Read off the roster, never stored as a count.

      Team size is the divisor in the team score, so a stored count is a second source of truth
      that drifts from the thing it describes (CLAUDE.md). It is only a caption here, but a caption
      that disagrees with the team screen is worse than no caption.
    */
    teamSize: participant?.team?._count.members ?? null,
    setLabel: participant?.chosenSet?.label ?? null,
  };
}

/**
 * Which of the three lobbies to draw.
 *
 * Both halves check the state AND the clock, because they disagree in real, reachable situations:
 * a contest left in `RUNNING` past its `endsAt` accepts nothing (`assertCanSubmit` checks both
 * bounds), and a contest an organizer opened early is `RUNNING` before its `startsAt` and also
 * accepts nothing. Keying the screen on the state alone would show a live lobby in both.
 */
function phaseOf(
  contest: { state: string; startsAt: Date; endsAt: Date },
  now: Date,
): ContestPhaseName {
  if (contest.state === "ENDED" || contest.state === "ARCHIVED") return "after";
  if (now.getTime() > contest.endsAt.getTime()) return "after";
  if (contest.state === "DRAFT" || contest.state === "SCHEDULED") return "before";
  if (now.getTime() < contest.startsAt.getTime()) return "before";
  return "live";
}


/**
 * Just the viewer's kind, for the lobby's signed-out state.
 *
 * The lobby is a client component and its `useParticipant` hook maps an ADMIN session to
 * "anonymous" (an organizer has no participantId), so without this an organizer who takes the
 * "View as a student" link is told "You are not signed in" on a screen they are signed in to. This
 * is a server cookie read, so it is authoritative and costs no extra round trip: the page already
 * awaits the phase.
 */
export async function viewerKindForLobby(now: Date = new Date()): Promise<"anonymous" | "competitor" | "admin"> {
  const viewer = await viewerFromCookies(now);
  return viewer.kind;
}
