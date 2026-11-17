import Link from "next/link";

import type { Door } from "@/lib/contest/door";

import { ContinueAsCard } from "./ContinueAsCard";

export interface SignedInNoticeProps {
  /** Only the two competitor doors have anything to say above the form. */
  readonly door: Extract<Door, { kind: "seat" } | { kind: "practice" }>;
}

/**
 * The top of `/join` for somebody who is already signed in.
 *
 * A student holding a seat gets the same card the home page shows: their mark, "Continue as Jo",
 * and "Not you? Sign out", which is what a student at a shared laptop needs before typing their
 * own code. The code form stays below it for somebody else's slip.
 *
 * A practice guest is not recognised the same way, because a guest is not who they will be on the
 * night. They came here to type a code, so the form is the page and this is one quiet line that
 * says which guest they are, with a way back to their problems. Typing a code signs the browser in
 * as the seat and leaves the guest behind.
 */
export function SignedInNotice({ door }: SignedInNoticeProps) {
  if (door.kind === "practice") {
    return (
      <p className="mb-6 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        You are practicing as {door.displayName}.{" "}
        <Link
          href="/contest"
          className="font-semibold text-ink underline underline-offset-2 hover:text-panther"
        >
          Back to practice
        </Link>
      </p>
    );
  }

  return (
    <div className="mb-6">
      <ContinueAsCard
        displayName={door.displayName}
        firstName={door.firstName}
        participantId={door.participantId}
        contestName={door.contestName}
        signedOutHref="/join"
      />
    </div>
  );
}
