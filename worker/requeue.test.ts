import { describe, expect, it } from "vitest";

import { MAX_JOB_ATTEMPTS } from "@/lib/judge/queue";

import { requeuesAfter } from "./requeue";

describe("requeuesAfter", () => {
  it("requeues an IE exactly once", () => {
    expect(MAX_JOB_ATTEMPTS).toBe(2);
    expect(requeuesAfter("IE", 1)).toBe(true);
    expect(requeuesAfter("IE", 2)).toBe(false);
  });

  it("never requeues a student verdict, CE included", () => {
    for (const verdict of ["AC", "WA", "TLE", "MLE", "RE", "CE"] as const) {
      expect(requeuesAfter(verdict, 1)).toBe(false);
    }
  });
});
