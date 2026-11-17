import type { Viewer } from "./viewer";

/**
 * Who is at the front door, in the four shapes the home page and `/join` answer differently.
 *
 * A competitor session is one of two things the cookie alone cannot tell apart: a practice guest
 * in the arena, or a student holding a seat in the night's contest. They need opposite doors. A
 * guest keeps the anonymous page, with Practice taking them straight back and the code form still
 * open for the slip they get later. A seat is recognised, the way an account chooser recognises a
 * returning person, with "Continue as Jo" and a way out. Pressing Practice would replace a seat's
 * session, so a seat is never offered it.
 *
 * Pure: the contest's `isPractice` arrives as an argument, read by the caller.
 */
export type Door =
  | { readonly kind: "anonymous" }
  | { readonly kind: "practice"; readonly displayName: string; readonly participantId: string }
  | {
      readonly kind: "seat";
      readonly displayName: string;
      readonly firstName: string;
      readonly participantId: string;
      readonly contestName: string | null;
    }
  | { readonly kind: "admin" };

export interface DoorContestFacts {
  readonly isPractice: boolean;
  readonly name: string;
}

/**
 * The first word of a display name, for "Continue as Jo".
 *
 * Seats are named "First Last" on the roster. An empty name falls back to "you", so the button
 * never reads "Continue as ".
 */
export function firstNameOf(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === "") return "you";
  const [first] = trimmed.split(/\s+/);
  return first ?? trimmed;
}

/**
 * Map a viewer to a door. `contest` is the competitor's contest row, or null when it could not be
 * read. A competitor whose contest is unreadable is treated as a seat, because offering Practice
 * to a seat is the one mistake here that costs a student their session.
 */
export function doorFor(viewer: Viewer, contest: DoorContestFacts | null): Door {
  switch (viewer.kind) {
    case "anonymous":
      return { kind: "anonymous" };
    case "admin":
      return { kind: "admin" };
    case "competitor":
      if (contest?.isPractice === true) {
        return {
          kind: "practice",
          displayName: viewer.displayName,
          participantId: viewer.participantId,
        };
      }
      return {
        kind: "seat",
        displayName: viewer.displayName,
        firstName: firstNameOf(viewer.displayName),
        participantId: viewer.participantId,
        contestName: contest?.name ?? null,
      };
  }
}
