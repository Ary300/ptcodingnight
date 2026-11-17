import type { Metadata } from "next";

import { StudentStandingsView } from "@/components/contest/standings/StudentStandingsView";

// A pipe, not an em dash: a browser tab is read by a person, so the no-em-dash rule reaches it.
export const metadata: Metadata = {
  title: "Standings | Coding Night",
};

/**
 * `/standings`: the team board the projector shows, on a student's own laptop. Thin, like every
 * page in this route group; the board is read client-side and refreshes itself.
 */
export default function StandingsPage() {
  return <StudentStandingsView />;
}
