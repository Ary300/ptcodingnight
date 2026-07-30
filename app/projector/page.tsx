import { ProjectorScreen, TeamProjectorScreen } from "@/components/leaderboard";

/**
 * `/projector` — the board on the wall.
 *
 * Thin by design: read the contest from the query string, hand it to the client component,
 * get out of the way. No auth check, because there is nothing to protect — the public
 * standings are already public, and asking a spectator screen to log in is the fastest way
 * to have nothing on the wall when the room fills up.
 *
 * `?contest=<id>` pins a specific contest; omitting it lets the API choose the running one.
 *
 * `?mode=individual` falls back to the per-player board. **Teams are the default**, because Coding
 * Night ranks teams (PRD §6.1) — the individual board remains for the ICPC preset, where players are
 * ranked against each other and there are no teams to total.
 */
export default async function ProjectorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contest = params.contest;
  const contestId = typeof contest === "string" && contest.length > 0 ? contest : null;

  if (params.mode === "individual") return <ProjectorScreen contestId={contestId} />;

  return <TeamProjectorScreen contestId={contestId} />;
}
