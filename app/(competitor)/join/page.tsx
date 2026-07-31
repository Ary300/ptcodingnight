import type { Metadata } from "next";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { JoinForm } from "@/components/contest/join/JoinForm";

export const metadata: Metadata = {
  title: "Join — Coding Night",
};

/**
 * The entry screen, laid out the way HackerRank lays out its login: a dark brand panel on the
 * left, the form on white to the right of it.
 *
 * The split collapses below `lg`, and on a phone only the form survives — students are on phones
 * (PRD §11), and a decorative half-screen above the one field they came here to fill in is worse
 * than no decoration at all. `BrandPanel` is `hidden lg:flex` for that reason rather than being
 * stacked and scrolled past.
 */
export default function JoinPage() {
  return (
    <div className="grid min-h-[calc(100vh-3.25rem)] lg:grid-cols-2">
      <BrandPanel>
        <p className="font-display" style={{ fontSize: "var(--text-md)" }}>
          Welcome to
        </p>
        <p className="font-display font-bold" style={{ fontSize: "var(--text-2xl)" }}>
          Coding Night
        </p>
        <p className="mt-3 text-paper/75" style={{ fontSize: "var(--text-sm)" }}>
          Park Tudor&rsquo;s programming contest. Solve problems, submit, watch the board move.
        </p>
      </BrandPanel>

      <div className="flex flex-col justify-center px-4 py-10 lg:px-14">
        <div className="w-full max-w-sm">
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            Join the contest
          </h1>
          <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Two steps. It takes about ten seconds.
          </p>

          <div className="mt-6">
            <JoinForm />
          </div>
        </div>
      </div>
    </div>
  );
}
