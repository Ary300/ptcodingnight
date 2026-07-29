import type { Metadata } from "next";

import { JoinForm } from "@/components/contest/join/JoinForm";

export const metadata: Metadata = {
  title: "Join — Coding Night",
};

export default function JoinPage() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Join the contest
        </h1>
        <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Two steps. It takes about ten seconds.
        </p>
      </div>
      <div className="mt-6 w-full max-w-sm">
        <JoinForm />
      </div>
    </div>
  );
}
