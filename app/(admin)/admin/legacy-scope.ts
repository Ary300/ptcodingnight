import { redirect } from "next/navigation";

/**
 * The flat, contest-scoped organizer URLs, kept alive as doors into the new shape.
 *
 * `/admin/teams?contest=<id>` and its four siblings were the old model: a global nav item plus a
 * query string that nothing in the nav preserved. They are not deleted, because they are in the
 * old nav, in `docs/`, in the a11y suite and in whatever an organizer bookmarked — and because
 * deleting a screen to simplify a nav is how a capability quietly stops being reachable.
 *
 * With a contest in the query string they redirect into the contest's own tab, which is where the
 * screen lives now. Without one they render the contest list, exactly as they used to, so the
 * "which contest?" answer is still one click rather than an id from `psql`.
 *
 * `redirect()` throws rather than returning, so a call site that reaches the next line knows there
 * was no contest in the query string. Awaiting it and then rendering the picker is the whole
 * pattern — there is nothing to branch on.
 */
export async function redirectIntoContestTab(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  tab: string,
): Promise<void> {
  const params = await searchParams;
  const contest = params.contest;
  if (typeof contest !== "string" || contest.length === 0) return;

  redirect(`/admin/contests/${encodeURIComponent(contest)}${tab}`);
}
