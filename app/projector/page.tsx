import { ProjectorScreen } from "@/components/leaderboard";

/**
 * `/projector` — the board on the wall.
 *
 * Thin by design: read the contest from the query string, hand it to the client component,
 * get out of the way. No auth check, because there is nothing to protect — the public
 * standings are already public, and asking a spectator screen to log in is the fastest way
 * to have nothing on the wall when the room fills up.
 *
 * `?contest=<id>` pins a specific contest; omitting it lets the API choose the running one.
 */
export default async function ProjectorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contest = params.contest;
  const contestId = typeof contest === "string" && contest.length > 0 ? contest : null;

  return <ProjectorScreen contestId={contestId} />;
}
