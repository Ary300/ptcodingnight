import { ProjectorScreen, TeamProjectorScreen } from "@/components/leaderboard";

/**
 * `/projector` — the board on the wall.
 *
 * Thin by design: read the contest from the query string, hand it to the client component,
 * get out of the way. No auth check, because there is nothing to protect — the public
 * standings are already public, and asking a spectator screen to log in is the fastest way
 * to have nothing on the wall when the room fills up.
 *
 * `?contest=<id>` pins a specific contest; **omitting it shows whichever contest is running**,
 * which is what an organizer who just opens `/projector` means. That promise lived in this
 * docstring long before it was true anywhere else: the team board — the default — had no
 * un-scoped route to ask, so a bare `/projector` painted an instruction to go and edit the URL.
 *
 * `?contestId=` is accepted as well as `?contest=`. `/api/standings` has always spelled it the
 * long way and this page the short way, so whichever one an organizer copies out of a URL bar
 * now works. Ignoring the other spelling is the worst of the options available: the board comes
 * up looking perfectly correct, showing a different contest.
 *
 * `?mode=individual` falls back to the per-player board. **Teams are the default**, because Coding
 * Night ranks teams (PRD §6.1) — the individual board remains for the ICPC preset, where players are
 * ranked against each other and there are no teams to total.
 */

/** First non-empty value among the accepted spellings. An array arrives from a repeated key. */
function firstValue(...values: (string | string[] | undefined)[]): string | null {
  for (const value of values) {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

export default async function ProjectorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contestId = firstValue(params.contest, params.contestId);

  if (params.mode === "individual") return <ProjectorScreen contestId={contestId} />;

  return (
    <TeamProjectorScreen
      contestId={contestId}
      // Pins the opening division tab, so a kiosk URL can be bookmarked per division.
      initialDivisionId={firstValue(params.division)}
    />
  );
}
