"use client";

import { useEffect, useState } from "react";

import { JoinResponseSchema } from "@/lib/schemas/api";

import type { JoinResponse } from "./contract";

/**
 * Who is sitting at this machine, for the length of one tab.
 *
 * `sessionStorage`, not `localStorage`: the lab machines are shared, and a participant
 * identity that outlives the tab is a participant identity the next student inherits.
 *
 * This is display state only. It is not authentication and must never be treated as such —
 * the server owns the session cookie and every route re-derives the participant from it.
 */

const STORAGE_KEY = "ptcn.participant";
/** Fired on write so two mounted components never disagree about who is joined. */
const CHANGE_EVENT = "ptcn:participant-change";

export function readParticipant(): JoinResponse | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  try {
    // Storage is a trust boundary like any other: parse, never cast.
    const parsed = JoinResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeParticipant(participant: JoinResponse): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(participant));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearParticipant(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export type ParticipantState =
  | { status: "loading"; participant: null }
  | { status: "anonymous"; participant: null }
  | { status: "joined"; participant: JoinResponse };

/**
 * Starts as `loading` on purpose. The server cannot know what is in `sessionStorage`, so
 * rendering anything identity-dependent on the first paint is a hydration mismatch.
 */
export function useParticipant(): ParticipantState {
  const [state, setState] = useState<ParticipantState>({
    status: "loading",
    participant: null,
  });

  useEffect(() => {
    const sync = () => {
      const participant = readParticipant();
      setState(
        participant === null
          ? { status: "anonymous", participant: null }
          : { status: "joined", participant },
      );
    };

    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return state;
}
