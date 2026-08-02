import { describe, expect, it } from "vitest";

import { RUNTIMES } from "@/lib/judge/runtimes";

import { describeMissingImages, findMissingImages, requiredImages } from "./preflight";

/**
 * The boot check is the last defence between "an image is missing" and "every submission for
 * that runtime fails as IE while a student watches a spinner". These tests pin the pure parts;
 * the one impure piece (the real `docker image inspect`) is injected, so nothing here needs a
 * daemon.
 */
describe("requiredImages", () => {
  it("lists every registry image when nothing is overridden", () => {
    const required = requiredImages({});
    for (const runtime of Object.values(RUNTIMES)) {
      expect(required).toContain(runtime.image);
    }
  });

  it("checks the overridden image instead of the registry's, because that is what will run", () => {
    const required = requiredImages({ python312: "python:3.12-slim-custom" });
    expect(required).toContain("python:3.12-slim-custom");
    expect(required).not.toContain(RUNTIMES.python312.image);
  });

  it("deduplicates, so two runtimes sharing an image cost one inspect", () => {
    // Point two runtimes at the same image; the boot must not inspect it twice.
    const shared = "ptcn-shared:test";
    const required = requiredImages({ python312: shared, node22: shared });
    expect(required.filter((image) => image === shared)).toHaveLength(1);
  });
});

describe("findMissingImages", () => {
  it("returns exactly the absent images, in required order", async () => {
    const present = new Set(["a:1", "c:3"]);
    const missing = await findMissingImages(
      ["a:1", "b:2", "c:3", "d:4"],
      (image) => Promise.resolve(present.has(image)),
    );
    expect(missing).toEqual(["b:2", "d:4"]);
  });

  it("returns nothing when every image exists", async () => {
    const missing = await findMissingImages(["a:1"], () => Promise.resolve(true));
    expect(missing).toEqual([]);
  });
});

describe("describeMissingImages", () => {
  it("names each missing image and the exact command that builds them", () => {
    const message = describeMissingImages(["gcc:14", "ptcn-go:1.23"]);
    expect(message).toContain("gcc:14");
    expect(message).toContain("ptcn-go:1.23");
    // The fix must be the literal invocation, not a description of one: the reader is starting
    // a worker at 6pm on the night, not browsing the docs.
    expect(message).toContain("scripts/build-judge-images.sh --verify");
  });
});
