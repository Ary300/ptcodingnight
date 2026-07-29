import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { API_ROUTES } from "@/lib/schemas/api";

import { repoRoot } from "./helpers/seed";

/**
 * G7 — is the UI actually wired to the API?
 *
 * This spec earned its keep on its first run: the frontend called `/api/problems`,
 * `/api/standings` and `/api/join` while the API served `/api/contests/[id]/problems`,
 * `/api/contests/[id]/standings` and `/api/contests/[id]/join`. Both halves agreed on every
 * payload, both typechecked, and nine of twelve URLs never met. Nothing but a running server
 * can catch that.
 *
 * The route set now lives in ONE place — `API_ROUTES` in `lib/schemas/api.ts` — so this spec
 * checks two things:
 *
 *   1. Every path `API_ROUTES` declares is answered by a handler in `app/api/**`.
 *   2. No client file declares an `/api/...` literal of its own. That is how the drift
 *      happened, and a passing (1) means nothing if a component can still hardcode its own URL.
 *
 * A handler "answered" if the reply is the `{ success, data, error }` envelope or an event
 * stream — 400, 401, 403 and 404 all pass, because they mean something in `app/api/**` replied.
 *
 * Status code alone cannot make that distinction: `GET /api/submissions/{id}` correctly answers
 * 404 for an id that does not exist, and Next answers 404 for a path with no route at all. What
 * separates them is the body. Every handler in this codebase goes through `lib/contest/http.ts`
 * and therefore replies with the `{ success, data, error }` envelope (or, for the stream, an
 * event-stream); Next's own 404 is an HTML page. So the envelope is the signal, not the status.
 */

const ROOT = repoRoot();

function sourceOf(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** Did something in `app/api/**` reply, as opposed to Next's own not-found page? */
function isApiEnvelope(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "success" in parsed &&
      "data" in parsed &&
      "error" in parsed
    );
  } catch {
    return false;
  }
}

/**
 * Concrete probes for every `API_ROUTES` entry. Ids are deliberately non-existent: this asks
 * "does a handler live here", not "does this row exist", so a 404 envelope is a pass.
 */
const PROBES: { name: string; probe: string; method: "GET" | "POST" }[] = [
  { name: "join", probe: API_ROUTES.join, method: "POST" },
  { name: "problems", probe: API_ROUTES.problems("no-such-contest"), method: "GET" },
  { name: "problem", probe: API_ROUTES.problem("no-such-contest", "no-such-slug"), method: "GET" },
  { name: "standings", probe: API_ROUTES.standings("no-such-contest"), method: "GET" },
  { name: "publicStandings", probe: API_ROUTES.publicStandings(), method: "GET" },
  { name: "stream", probe: API_ROUTES.stream("no-such-contest"), method: "GET" },
  { name: "runSamples", probe: API_ROUTES.runSamples, method: "POST" },
  { name: "submissions", probe: API_ROUTES.submissions, method: "GET" },
  { name: "submission", probe: API_ROUTES.submission("no-such-submission"), method: "GET" },
  { name: "adminSession", probe: API_ROUTES.adminSession, method: "POST" },
  { name: "adminFreeze", probe: API_ROUTES.adminFreeze("no-such-contest"), method: "POST" },
  { name: "adminExport", probe: API_ROUTES.adminExport("no-such-contest"), method: "GET" },
  { name: "adminOverride", probe: API_ROUTES.adminOverride("no-such-submission"), method: "POST" },
];

/** Client files that must route through `API_ROUTES` rather than their own literals. */
const CLIENT_SOURCES = [
  "components/contest/data/http-backend.ts",
  "components/leaderboard/constants.ts",
  "components/leaderboard/useStandings.ts",
];

test.describe("the UI's declared routes exist on the server", () => {
  for (const route of PROBES) {
    test(`${route.method} ${route.probe} (API_ROUTES.${route.name})`, async ({ request }) => {
      // An event-stream never closes, so a plain GET hangs. The timeout is not a workaround:
      // for this route, TIMING OUT IS THE PASS. Next's own 404 for a path with no handler
      // returns immediately, so a connection still open after five seconds is proof that
      // something in app/api/** is holding it.
      if (route.name === "stream") {
        let heldOpen = false;
        let contentType = "";
        try {
          const response = await request.get(route.probe, { timeout: 5_000 });
          contentType = response.headers()["content-type"] ?? "";
        } catch {
          heldOpen = true;
        }

        expect(
          heldOpen || contentType.includes("text/event-stream"),
          `API_ROUTES.stream points at ${route.probe}, but nothing held the connection open ` +
            `and the reply was ${contentType || "(no content-type)"} — so no SSE handler lives there.`,
        ).toBe(true);
        return;
      }

      const response =
        route.method === "GET"
          ? await request.get(route.probe)
          : await request.post(route.probe, { data: {} });

      const contentType = response.headers()["content-type"] ?? "";
      const body = await response.text();

      const answered =
        contentType.includes("text/event-stream") ||
        (contentType.includes("application/json") && isApiEnvelope(body));

      expect(
        answered,
        `API_ROUTES.${route.name} points at ${route.probe}, but no handler in app/api/** ` +
          `answers it — the server replied ${response.status()} ${contentType || "(no content-type)"}.`,
      ).toBe(true);
    });
  }
});

test.describe("no client file declares its own route literal", () => {
  for (const relativePath of CLIENT_SOURCES) {
    test(relativePath, () => {
      const source = sourceOf(relativePath);

      // Comments are stripped first. The initial version of this check flagged the doc
      // comments that EXPLAIN the rule — a false positive that teaches people to delete the
      // explanation rather than fix the code.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join("\n");

      const literals = code.match(/["'`]\/api\/[^"'`]*/g) ?? [];

      expect(
        literals,
        `${relativePath} hardcodes ${literals.join(", ")}. Route paths belong in API_ROUTES ` +
          "(lib/schemas/api.ts) — a second declaration is how the frontend and API drifted " +
          "onto different URLs while both typechecked.",
      ).toEqual([]);
    });
  }
});
