import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { repoRoot } from "./helpers/seed";

/**
 * G7 — is the UI actually wired to the API?
 *
 * The competitor screens and the projector reach the server through two files that each declare
 * their own route paths:
 *
 *   - `components/contest/data/http-backend.ts` (`ROUTES`)
 *   - `components/leaderboard/constants.ts` (`STANDINGS_ENDPOINT`)
 *
 * Those declarations were written before `app/api/**` existed, in a separate worktree, against
 * the frozen *payload* contract in `lib/schemas/api.ts` — which says nothing about URLs. So the
 * two halves can agree perfectly on shapes and still never speak.
 *
 * This spec asserts the URLs meet. It reads the declared paths out of the source rather than
 * restating them, so it cannot drift into testing a list nobody uses any more, and it asserts
 * only that a **route handler answered** — 400, 401, 403 and even 404 are all passes, because
 * they mean something in `app/api/**` replied.
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

interface DeclaredRoute {
  readonly source: string;
  readonly literal: string;
  readonly probe: string;
  readonly method: "GET" | "POST";
}

/**
 * `literal` is the exact text the source must still contain; `probe` is a concrete URL built
 * from it. If a literal disappears, the assertion below fails loudly rather than silently
 * testing a path the app no longer calls.
 */
const DECLARED: readonly DeclaredRoute[] = [
  {
    source: "components/contest/data/http-backend.ts",
    literal: 'join: "/api/join"',
    probe: "/api/join",
    method: "POST",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: 'problems: "/api/problems"',
    probe: "/api/problems",
    method: "GET",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: "problem: (slug: string) => `/api/problems/${encodeURIComponent(slug)}`",
    probe: "/api/problems/e2e-panther-sum",
    method: "GET",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: 'runSamples: "/api/run-samples"',
    probe: "/api/run-samples",
    method: "POST",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: 'submissions: "/api/submissions"',
    probe: "/api/submissions",
    method: "GET",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: "submission: (id: string) => `/api/submissions/${encodeURIComponent(id)}`",
    probe: "/api/submissions/does-not-exist",
    method: "GET",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: "submissionStream: (id: string) => `/api/submissions/${encodeURIComponent(id)}/stream`",
    probe: "/api/submissions/does-not-exist/stream",
    method: "GET",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: 'standings: "/api/standings"',
    probe: "/api/standings",
    method: "GET",
  },
  {
    source: "components/contest/data/http-backend.ts",
    literal: 'hints: "/api/hints"',
    probe: "/api/hints",
    method: "GET",
  },
  {
    source: "components/leaderboard/constants.ts",
    literal: 'export const STANDINGS_ENDPOINT = "/api/standings"',
    probe: "/api/standings",
    method: "GET",
  },
];

test.describe("the UI's declared routes exist on the server", () => {
  for (const route of DECLARED) {
    test(`${route.method} ${route.probe} (declared in ${route.source})`, async ({ request }) => {
      expect(
        sourceOf(route.source),
        `${route.source} no longer declares ${route.literal}; update this spec`,
      ).toContain(route.literal);

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
        `${route.method} ${route.probe} is called by ${route.source}, but no route handler ` +
          `answers it — the server replied ${response.status()} ${contentType || "(no content-type)"}. ` +
          "The competitor UI and the projector cannot reach the API at this path.",
      ).toBe(true);
    });
  }
});
