import { describe, expect, it } from "vitest";

import {
  CODE_WALL_PAGE_SIZE,
  byDisplayName,
  initialRange,
  paginateSeats,
} from "@/lib/contest/code-wall";

/**
 * The projected code wall's arithmetic.
 *
 * All three of these are read by a room rather than by a person at a desk, which is what makes them
 * worth testing: a paging bug shows a student a screen their name is not on, and the only feedback
 * is forty people asking the organizer where their code is.
 */

describe("paginateSeats", () => {
  const seats = Array.from({ length: 34 }, (_unused, index) => index);

  it("fills every page but the last", () => {
    const pages = paginateSeats(seats, 24);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(24);
    expect(pages[1]).toHaveLength(10);
  });

  it("keeps the roster's order and loses nobody", () => {
    // The order IS the feature: A to Z is what makes a rotating board searchable by eye.
    expect(paginateSeats(seats, 7).flat()).toEqual(seats);
  });

  it("yields no pages for an empty roster", () => {
    // Not one empty page. "Page 1 of 1" over an empty screen tells the room something false.
    expect(paginateSeats([], 24)).toEqual([]);
  });

  it("yields exactly one page when the roster fits", () => {
    expect(paginateSeats(seats.slice(0, 24), 24)).toHaveLength(1);
    expect(paginateSeats(seats.slice(0, 25), 24)).toHaveLength(2);
  });

  it("refuses a page size that would loop forever", () => {
    expect(() => paginateSeats(seats, 0)).toThrow(RangeError);
  });

  it("defaults to the size both projector resolutions were measured against", () => {
    expect(CODE_WALL_PAGE_SIZE).toBe(24);
    expect(paginateSeats(seats)).toHaveLength(2);
  });
});

describe("initialRange", () => {
  it("names both ends of the page", () => {
    expect(initialRange(["Aditi Rao", "Maya Rosenberg", "Victor Oduya"])).toBe("A to V");
  });

  it("gives one letter when the page does not span two", () => {
    expect(initialRange(["Aditi Rao", "Amara Nwosu"])).toBe("A");
  });

  it("is empty for an empty page, so the header can leave it out", () => {
    expect(initialRange([])).toBe("");
  });

  it("upper-cases, and reads the first character of a lower-case name", () => {
    expect(initialRange(["aditi rao", "zoe petrov"])).toBe("A to Z");
  });

  it("ignores leading whitespace rather than reporting a blank range", () => {
    expect(initialRange(["  Priya Nair"])).toBe("P");
  });

  it("skips a name with no characters at all", () => {
    // A seat with an empty display name should not contribute a blank that sorts ahead of A.
    expect(initialRange(["", "Ben Whitfield", "Dev Patel"])).toBe("B to D");
  });
});

describe("byDisplayName", () => {
  const seat = (displayName: string, participantId: string) => ({ displayName, participantId });

  it("sorts A to Z regardless of case", () => {
    const sorted = [seat("zoe", "3"), seat("Aditi", "1"), seat("maya", "2")].sort(byDisplayName);
    expect(sorted.map((s) => s.displayName)).toEqual(["Aditi", "maya", "zoe"]);
  });

  it("breaks a tie on the seat id, so the same roster always pages the same way", () => {
    /*
      Two students with the same display name is normal (the roster only appends a counter when the
      organizer's own input collides). Without a tie-break, the two could swap places between
      renders and a page would appear to reshuffle itself on the wall.
    */
    const one = [seat("Alex Kim", "b"), seat("Alex Kim", "a")].sort(byDisplayName);
    const two = [seat("Alex Kim", "a"), seat("Alex Kim", "b")].sort(byDisplayName);
    expect(one.map((s) => s.participantId)).toEqual(["a", "b"]);
    expect(two.map((s) => s.participantId)).toEqual(["a", "b"]);
  });

  it("does not depend on the machine's locale", () => {
    // `localeCompare` would order these by the projector laptop's collation rather than by a rule
    // this repo controls. Code-unit order is boring and identical everywhere.
    expect(byDisplayName(seat("a", "1"), seat("B", "2"))).toBeLessThan(0);
    expect(byDisplayName(seat("B", "2"), seat("a", "1"))).toBeGreaterThan(0);
    expect(byDisplayName(seat("same", "1"), seat("same", "1"))).toBe(0);
  });
});
