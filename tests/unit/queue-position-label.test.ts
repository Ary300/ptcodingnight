import { describe, expect, it } from "vitest";

import { queuePositionLabel } from "@/components/contest/verdict/verdict-display";

/**
 * The waiting student's one line of queue truth. The wording carries two promises: it never
 * shows a count beside "working on yours" (the two claims contradict), and it never pluralises
 * wrongly - "1 submissions" reads as a broken screen at exactly the moment the student is
 * deciding whether the platform is broken.
 */
describe("queuePositionLabel", () => {
  it("says the judge has it once the job is active", () => {
    expect(queuePositionLabel({ state: "active", ahead: 0 })).toBe(
      "The judge is working on yours now.",
    );
  });

  it("says next for a waiting job with nothing ahead", () => {
    expect(queuePositionLabel({ state: "waiting", ahead: 0 })).toBe(
      "Yours is next in the queue.",
    );
  });

  it("uses the singular for exactly one job ahead", () => {
    expect(queuePositionLabel({ state: "waiting", ahead: 1 })).toBe(
      "1 submission ahead of yours in the queue.",
    );
  });

  it("counts the jobs ahead in the plural", () => {
    expect(queuePositionLabel({ state: "waiting", ahead: 7 })).toBe(
      "7 submissions ahead of yours in the queue.",
    );
  });
});
