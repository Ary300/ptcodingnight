import type { Metadata } from "next";

import { LobbyView } from "@/components/contest/lobby/LobbyView";

import { loadContestPhase } from "./contest-phase";

export const metadata: Metadata = {
  // A pipe, not an em dash: no em dash may appear in anything a person using this site can read,
  // and a browser tab is read. The pipe is what `/sign-in` and the organizer layout already use.
  title: "Problems | Coding Night",
};

/**
 * Dynamic, because the phase below is read from the session cookie and from a clock. A cached copy
 * of this page would serve one student's team to another and a countdown frozen at whatever it read
 * when the page was built.
 */
export const dynamic = "force-dynamic";

export default async function ContestPage() {
  /*
    The contest window, loaded here rather than fetched by the lobby.

    It has to be in the first paint: a countdown that arrives one request later starts at
    `--:--:--` and then jumps, on the one screen a student watches for twenty minutes. See
    `contest-phase.ts` for why it is a server read and not another API route.

    Null for an anonymous visitor or an organizer. The lobby draws its sign-in state for those and
    never reads a phase.
  */
  const phase = await loadContestPhase();

  /*
    Keyed on the phase, which remounts the lobby when the contest opens or closes.

    `PreStartPanel` re-asks the server on an interval once its clock runs out, and a plain
    `router.refresh()` re-renders the server tree while PRESERVING client state — including the
    already-settled problem list, which before the start is a list of locked rows with the titles
    withheld. Without the key the screen could turn into the live lobby still showing "Problem A1"
    on every row until the student reloaded, which is the same dead end one phase later.

    Two remounts per night is the entire cost.
  */
  return <LobbyView key={phase?.phase ?? "signed-out"} phase={phase} />;
}
