import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { jsonOk, jsonOkRevalidated, matchesEtag } = await import("@/lib/contest/http");
const { clockMayMove } = await import("@/lib/contest/contests");
const { clockShouldEnd } = await import("@/lib/contest/gate");

/**
 * The two cheap paths in front of a polled board: the ETag that turns an unchanged board into a
 * 304, and the stale-row check that decides whether the contest clock needs a fresh read at all.
 * Each is only allowed if it can never change what anybody is shown.
 */

const URL_ = "http://localhost/api/contests/c1/team-standings";

function request(ifNoneMatch?: string): Request {
  return new Request(URL_, ifNoneMatch === undefined ? {} : { headers: { "if-none-match": ifNoneMatch } });
}

const board = { contestId: "c1", frozen: false, teams: [{ name: "Red", score: 120 }] };

describe("jsonOkRevalidated", () => {
  it("sends exactly the bytes jsonOk sends", async () => {
    const plain = await jsonOk(board).text();
    const tagged = jsonOkRevalidated(request(), board);
    expect(tagged.status).toBe(200);
    expect(await tagged.text()).toBe(plain);
    expect(tagged.headers.get("content-type")).toContain("application/json");
  });

  it("answers 304 with no body when the browser already holds these bytes", async () => {
    const etag = jsonOkRevalidated(request(), board).headers.get("etag");
    expect(etag).toMatch(/^"[\w-]+"$/);

    const again = jsonOkRevalidated(request(etag ?? ""), board);
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("etag")).toBe(etag);
  });

  it("answers 200 the moment the bytes differ, whoever the previous bytes were for", async () => {
    const publicTag = jsonOkRevalidated(request(), board).headers.get("etag") ?? "";
    // The organizer's board through a freeze is a different object with different bytes.
    const organizerBoard = { ...board, teams: [{ name: "Red", score: 180 }] };
    const response = jsonOkRevalidated(request(publicTag), organizerBoard);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("180");
  });

  it("is the same tag for equal bytes from a different object (a recomputed, unchanged board)", () => {
    const first = jsonOkRevalidated(request(), board).headers.get("etag");
    const recomputed = jsonOkRevalidated(request(), structuredClone(board)).headers.get("etag");
    expect(recomputed).toBe(first);
  });

  it("can never be stored by a shared cache, and is revalidated on every request", () => {
    const response = jsonOkRevalidated(request(), board);
    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-cache");
    expect(cacheControl).not.toContain("public");
    expect(cacheControl).not.toMatch(/max-age=[1-9]/);
    expect(response.headers.get("vary")).toContain("Cookie");
  });

  it("matches If-None-Match lists, weak tags and the wildcard", () => {
    expect(matchesEtag('"a", W/"b"', '"b"')).toBe(true);
    expect(matchesEtag("*", '"b"')).toBe(true);
    expect(matchesEtag('"a"', '"b"')).toBe(false);
    expect(matchesEtag(null, '"b"')).toBe(false);
  });
});

describe("clockMayMove is a superset of the clock's real conditions", () => {
  const startsAt = new Date("2026-11-13T19:00:00Z");
  const endsAt = new Date("2026-11-13T20:15:00Z");
  const freezes = [null, new Date("2026-11-13T19:45:00Z")];
  const instants = [
    "2026-11-13T18:59:59Z",
    "2026-11-13T19:00:00Z",
    "2026-11-13T19:50:00Z",
    "2026-11-13T20:15:00Z",
    "2026-11-13T21:00:00Z",
  ].map((iso) => new Date(iso));
  const states = ["DRAFT", "SCHEDULED", "RUNNING", "FROZEN", "ENDED", "ARCHIVED"];

  it("is true whenever reconcileContestClock would start or end the contest", () => {
    for (const state of states) {
      for (const freezeAt of freezes) {
        for (const now of instants) {
          const contest = { id: "c1", state, startsAt, endsAt, freezeAt };
          const wouldStart =
            state === "SCHEDULED" &&
            startsAt.getTime() <= now.getTime() &&
            now.getTime() < endsAt.getTime();
          const wouldEnd =
            (state === "RUNNING" || state === "FROZEN") &&
            clockShouldEnd({ ...contest, state }, now);
          if (wouldStart || wouldEnd) expect(clockMayMove(contest, now), `${state} ${now.toISOString()}`).toBe(true);
        }
      }
    }
  });

  it("is false for a frozen board past its end, which waits for the organizer's reveal", () => {
    const afterEnd = new Date(endsAt.getTime() + 20 * 60_000);
    const freezeAt = new Date(endsAt.getTime() - 15 * 60_000);
    expect(clockMayMove({ state: "FROZEN", startsAt, endsAt, freezeAt }, afterEnd)).toBe(false);
    expect(clockMayMove({ state: "RUNNING", startsAt, endsAt, freezeAt }, afterEnd)).toBe(false);
    expect(clockMayMove({ state: "RUNNING", startsAt, endsAt, freezeAt: null }, afterEnd)).toBe(true);
  });

  it("is false in the middle of a running contest, which is where every poll of the night lands", () => {
    expect(
      clockMayMove({ state: "RUNNING", startsAt, endsAt, freezeAt: null }, new Date("2026-11-13T19:30:00Z")),
    ).toBe(false);
    expect(
      clockMayMove({ state: "FROZEN", startsAt, endsAt, freezeAt: null }, new Date("2026-11-13T20:00:00Z")),
    ).toBe(false);
  });
});
