import { ProblemWorkspace } from "@/components/contest/problem/ProblemWorkspace";

import { loadContestPhase } from "../contest-phase";

/**
 * `params` is a Promise in this Next version, so the slug is awaited here and the workspace
 * below it stays a plain client component with a string prop.
 *
 * The contest window is read here, on the server, for the same reason the lobby reads it: the
 * workspace disables Run samples and Submit once submissions close, and it has to know the end
 * in the first paint rather than find out from a refused press. `null` for an organizer or a
 * visitor, who has no window of their own.
 */
export default async function ProblemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const phase = await loadContestPhase();
  return (
    <ProblemWorkspace
      slug={slug}
      window={
        phase === null
          ? null
          : {
              endsAt: phase.endsAt,
              serverTime: phase.serverTime,
              closedAtLoad: phase.phase === "after",
            }
      }
    />
  );
}
