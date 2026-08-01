import type { Metadata } from "next";

import { SubmissionHistory } from "@/components/contest/submissions/SubmissionHistory";
import { Crumbs } from "@/components/ui";

export const metadata: Metadata = {
  // A pipe, not an em dash. A browser tab is read by a person, so the no-em-dash rule reaches it.
  title: "My submissions | Coding Night",
};

export default function SubmissionsPage() {
  return (
    // Capped at the measure the problem list uses. Full-width rows on a 1440px laptop put the
    // verdict a hand's width from the title, which is the one pairing this page exists to show.
    <div className="max-w-4xl">
      <Crumbs trail={[{ href: "/contest", label: "Coding Night" }, { label: "My submissions" }]} />
      <h1 className="mt-1 font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
        My submissions
      </h1>
      <p className="mt-1 mb-4 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Every judged submission, newest first. Sample runs are free and never appear here.
      </p>
      <SubmissionHistory />
    </div>
  );
}
