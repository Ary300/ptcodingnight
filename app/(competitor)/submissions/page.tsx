import type { Metadata } from "next";

import { SubmissionHistory } from "@/components/contest/submissions/SubmissionHistory";

export const metadata: Metadata = {
  title: "My submissions — Coding Night",
};

export default function SubmissionsPage() {
  return (
    <div>
      <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
        My submissions
      </h1>
      <p className="mt-1 mb-5 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
        Every judged submission, newest first.
      </p>
      <SubmissionHistory />
    </div>
  );
}
