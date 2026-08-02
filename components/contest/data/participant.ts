"use client";

import { useEffect, useState } from "react";

import { JoinResponseSchema } from "@/lib/schemas/api";

import type { JoinResponse } from "./contract";

/**
 * Who is sitting at this machine.
 *
 * ## The bug this file used to be
 *
 * This was a `sessionStorage` record written by the join response and read by everything. When the
 * join route was deleted, **nothing was left that ever wrote it** — `writeParticipant` had no
 * callers outside the test helpers. So the product produced a valid server session and a client
 * that could not name its own contest, and every competitor screen answered a signed-in student
 * with *"You are not in the contest yet — sign in to compete."* They would sign in, land back on
 * `/contest`, and read it again. Forever.
 *
 * It was invisible to the suites because `tests/e2e/helpers/session.ts` and the a11y journey
 * helper both call `writeParticipant` themselves. **The tests injected the one piece of state the
 * product never created**, so G7 and G9 were green against a front door that did not open.
 *
 * ## What it is now
 *
 * `GET /api/auth/session` is the source of truth, because the server is the only thing that knows.
 * The cookie is the identity; this is a read of it.
 *
 * `sessionStorage` survives only as a first-paint cache, and is never trusted over the server: it
 * exists so a reload does not flash "not signed in" for the length of one request. If the server
 * says anonymous the cache is wrong and is discarded — which is also what makes signing out on a
 * shared lab machine actually clear the previous student.
 */

const STORAGE_KEY = "ptcn.participant";
const SCOPE_STORAGE_KEY = "ptcn.participant-scope";
/** Fired on write so two mounted components never disagree about who is joined. */
const CHANGE_EVENT = "ptcn:participant-change";
const PARTICIPANT_REQUEST_TIMEOUT_MS = 10_000;
/** Newest-started session read owns the cache; a slower predecessor may never overwrite it. */
let latestParticipantRequest = 0;
/**
 * Foreground consumers mount together in the competitor shell. Share their unsigned request so a
 * failed session response reaches every consumer as the same error instead of making an older
 * caller fall back to an empty cache and falsely render "not signed in". Background polling passes
 * an AbortSignal and stays independent so unmounting it cannot cancel a page's foreground read.
 */
let sharedParticipantRequest: Promise<JoinResponse | null> | null = null;

function participantFromNewerRequest(): JoinResponse {
  const current = readParticipant();
  if (current !== null) return current;

  // Only a current, successful session response may establish anonymity. Returning null merely
  // because a newer request exists turns an empty cache plus an HTTP failure into "signed out".
  throw new Error("A newer sign-in check is still in progress.");
}

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

function fallbackScopeKey(participant: JoinResponse): string {
  return `${participant.participantId}:${participant.divisionId ?? "no-division"}:${participant.needsTeam ? "no-team" : "team"}:${participant.chosenSetId ?? "no-set"}`;
}

function readParticipantScope(participant: JoinResponse): string {
  if (typeof window === "undefined") return fallbackScopeKey(participant);
  return window.sessionStorage.getItem(SCOPE_STORAGE_KEY) ?? fallbackScopeKey(participant);
}

export function writeParticipant(participant: JoinResponse, scopeKey?: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(participant));
  window.sessionStorage.setItem(SCOPE_STORAGE_KEY, scopeKey ?? fallbackScopeKey(participant));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearParticipant(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(SCOPE_STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Ask the server who this browser is, and cache the answer for first paint.
 *
 * Exported because the data layer needs it too: `http-backend.ts` cannot call a contest-scoped
 * route without a contest id, and this is where that id comes from now.
 *
 * Returns null for anonymous AND for an organizer. An admin session is signed in but is not a
 * competitor, and handing the competitor screens an identity with no `participantId` would swap
 * "you are not in this contest" for a crash. Network, HTTP, and schema failures throw so the UI
 * cannot mislabel a server outage as a signed-out student.
 */
async function fetchParticipantOnce(signal?: AbortSignal): Promise<JoinResponse | null> {
  const request = ++latestParticipantRequest;
  let response: Response;
  try {
    response = await fetch("/api/auth/session", { cache: "no-store", signal });
  } catch (caught) {
    if (request !== latestParticipantRequest) return participantFromNewerRequest();
    if (signal?.aborted === true) throw caught;
    throw new Error("Could not reach the contest server to check your sign-in.");
  }

  if (request !== latestParticipantRequest) return participantFromNewerRequest();

  if (!response.ok) {
    throw new Error("The contest server could not check your sign-in. Reload the page in a moment.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (request !== latestParticipantRequest) return participantFromNewerRequest();
    throw new Error("The contest server sent an unreadable sign-in response.");
  }

  if (request !== latestParticipantRequest) return participantFromNewerRequest();

  const data =
    typeof body === "object" && body !== null && "data" in body
      ? (body as { data: unknown }).data
      : null;
  if (typeof data !== "object" || data === null) {
    throw new Error("The contest server sent an incomplete sign-in response.");
  }

  const session = data as Record<string, unknown>;
  if (session.signedIn !== true || session.role !== "COMPETITOR") {
    clearParticipant();
    return null;
  }

  // Built to the shape the rest of the client already consumes, and PARSED rather than cast.
  // If the route stops sending a field this fails here instead of rendering `undefined` into a
  // problem list or falsely claiming that the student signed out.
  const parsed = JoinResponseSchema.safeParse({
    participantId: session.participantId,
    contestId: session.contestId,
    displayName: session.displayName,
    divisionId: session.divisionId ?? null,
    chosenSetId: session.chosenSetId ?? null,
    chosenSetLabel: session.chosenSetLabel ?? null,
    // Not a fact about this request. A session read is never "the moment you joined", and the
    // banner that word drives would otherwise fire on every page load.
    rejoined: true,
    needsTeam: session.teamId === null || session.teamId === undefined,
  });
  if (!parsed.success) {
    throw new Error("The contest server sent an incomplete competitor session.");
  }

  // Team identity is authorization scope for team detail and shared work. It is not part of the
  // public JoinResponse contract, so retain it only in this private cache key. A move from Team A
  // to Team B must invalidate resources even when division and chosen set happen to stay equal.
  const teamId = typeof session.teamId === "string" ? session.teamId : "no-team";
  writeParticipant(
    parsed.data,
    `${parsed.data.participantId}:${parsed.data.divisionId ?? "no-division"}:${teamId}:${parsed.data.chosenSetId ?? "no-set"}`,
  );
  return parsed.data;
}

export function fetchParticipant(signal?: AbortSignal): Promise<JoinResponse | null> {
  // A background poll that happens to meet a foreground read joins it. Its controller does not
  // own this request and therefore cannot cancel the page's read; the shared request has its own
  // bound below, and the poll ignores the result after unmount.
  if (sharedParticipantRequest !== null) return sharedParticipantRequest;
  if (signal !== undefined) return fetchParticipantOnce(signal);

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    PARTICIPANT_REQUEST_TIMEOUT_MS,
  );
  const request = fetchParticipantOnce(controller.signal).catch((caught: unknown) => {
    if (controller.signal.aborted) {
      throw new Error("Could not reach the contest server to check your sign-in.");
    }
    throw caught;
  });
  const shared = request.finally(() => {
    window.clearTimeout(timeout);
    if (sharedParticipantRequest === shared) sharedParticipantRequest = null;
  });
  sharedParticipantRequest = shared;
  return shared;
}

export type ParticipantState =
  | { status: "loading"; participant: null }
  | { status: "error"; participant: null; message: string }
  | { status: "anonymous"; participant: null }
  | { status: "joined"; participant: JoinResponse; scopeKey: string };

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
    let cancelled = false;

    /*
      Straight to the server, with no synchronous priming from the cache.

      Priming looked worth it — "do not flash not-signed-in on reload" — but there is no flash to
      prevent: the initial state is `loading`, and every consumer draws a loading state for it
      rather than an anonymous one. It also cannot be done here: a setState in an effect body is a
      cascading render, which the React Compiler rules reject.

      The cache still earns its place in `currentContestId()`, which is on the path of every read
      and cannot afford a round trip it does not need.
    */
    void fetchParticipant()
      .then((participant) => {
        if (cancelled) return;
        setState(
          participant === null
            ? { status: "anonymous", participant: null }
            : { status: "joined", participant, scopeKey: readParticipantScope(participant) },
        );
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          participant: null,
          message:
            caught instanceof Error
              ? caught.message
              : "The contest server could not check your sign-in.",
        });
      });

    const sync = () => {
      const current = readParticipant();
      setState(
        current === null
          ? { status: "anonymous", participant: null }
          : { status: "joined", participant: current, scopeKey: readParticipantScope(current) },
      );
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return state;
}
