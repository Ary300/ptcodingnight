import { describe, expect, it } from "vitest";

import {
  judgingProgressLabel,
  queuePositionLabel,
} from "@/components/contest/verdict/verdict-display";

/**
 * A queued submission read "Judging: running the first test… 3 submissions ahead of yours in the
 * queue." Nothing was running. These pin that "running" appears only once the judge has the job.
 */
describe("judgingProgressLabel", () => {
  it("says a queued submission is waiting in line, not running", () => {
    const header = judgingProgressLabel(0, null, "waiting");
    expect(header).toBe("Waiting in line to be judged…");
    expect(header).not.toMatch(/running/i);
    // Beside the count it now reads as one consistent statement.
    expect(`${header} ${queuePositionLabel({ state: "waiting", ahead: 3 })}`).toBe(
      "Waiting in line to be judged… 3 submissions ahead of yours in the queue.",
    );
  });

  it("does not claim a test is running when the total is known but the job is queued", () => {
    expect(judgingProgressLabel(0, 12, "waiting")).toBe("Waiting in line to be judged…");
  });

  it("does not claim running when the queue could not be asked", () => {
    expect(judgingProgressLabel(0, null, null)).toBe("Waiting for the judge…");
    expect(judgingProgressLabel(0, 5)).toBe("Waiting for the judge…");
  });

  it("says running once the judge has the job", () => {
    expect(judgingProgressLabel(0, null, "active")).toBe("Judging: running the first test…");
    expect(judgingProgressLabel(0, 5, "active")).toBe("Running test 1 of 5, 4 still to go…");
  });

  it("reports progress once results come back, whatever the queue said last", () => {
    expect(judgingProgressLabel(2, 5, null)).toBe("Running test 3 of 5, 2 still to go…");
    expect(judgingProgressLabel(1, null, null)).toBe("Judging: 1 test finished, running the next…");
    expect(judgingProgressLabel(5, 5, null)).toBe("All tests have run. Working out the verdict…");
  });
});
