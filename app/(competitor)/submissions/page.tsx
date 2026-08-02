import type { Metadata } from "next";

import { SubmissionHistory } from "@/components/contest/submissions/SubmissionHistory";
import { Crumbs } from "@/components/ui";

export const metadata: Metadata = {
  // A pipe, not an em dash. A browser tab is read by a person, so the no-em-dash rule reaches it.
  title: "My submissions | Coding Night",
};

export default function SubmissionsPage() {
  return (
    // No width cap of its own: the chrome's max-w-6xl column IS the measure here, as it is on
    // the reference. An extra max-w-4xl left a 384px band of bare ground at 1440 while the
    // reference's table fills its column; the verdict-next-to-title pairing survives because the
    // table's own columns hold their x-positions at any width.
    <div>
      <Crumbs trail={[{ href: "/contest", label: "Coding Night" }, { label: "My submissions" }]} />
      {/* Steps down to --text-lg below `sm` (the pattern ProblemWorkspace set): a flat 40px h1
          wraps at 360 and spends 120px of the first screen before any content. */}
      <h1 className="mt-1 font-display font-bold text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
        My submissions
      </h1>
      <p className="mt-1 mb-4 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Every judged submission, newest first. Sample runs are free and never appear here.
      </p>
      <SubmissionHistory />
    </div>
  );
}
