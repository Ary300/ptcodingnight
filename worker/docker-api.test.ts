import { describe, expect, it } from "vitest";

import { dockerSocketPath, parseExitState } from "./docker-api";

/**
 * The two pure halves of the Engine API path. The network half is exercised by every container
 * gate (G4, G5, G13), and its failure mode is a fallback to the CLI, never a wrong answer — so
 * what has to be pinned here is that a malformed or partial inspect document is REFUSED rather
 * than read as "not OOM-killed", which would turn an MLE into a TLE.
 */
describe("parseExitState", () => {
  const doc = (state: unknown) => JSON.stringify({ Id: "x", State: state });

  it("reads the three fields the judge uses", () => {
    expect(
      parseExitState(
        doc({
          OOMKilled: true,
          StartedAt: "2026-11-15T20:00:00.123456789Z",
          FinishedAt: "2026-11-15T20:00:01.5Z",
          Status: "exited",
        }),
      ),
    ).toEqual({
      oomKilled: true,
      startedAt: "2026-11-15T20:00:00.123456789Z",
      finishedAt: "2026-11-15T20:00:01.5Z",
      status: "exited",
    });
  });

  it("refuses a document with no Status, which is how a removal from outside is recognised", () => {
    expect(parseExitState(doc({ OOMKilled: false, StartedAt: "a", FinishedAt: "b" }))).toBeNull();
  });

  it("refuses a document whose OOMKilled is missing, so the CLI is asked instead", () => {
    expect(parseExitState(doc({ StartedAt: "a", FinishedAt: "b" }))).toBeNull();
  });

  it("refuses a non-boolean OOMKilled rather than guessing", () => {
    expect(parseExitState(doc({ OOMKilled: "true", StartedAt: "a", FinishedAt: "b" }))).toBeNull();
  });

  it("refuses missing timestamps", () => {
    expect(parseExitState(doc({ OOMKilled: false, StartedAt: "a" }))).toBeNull();
  });

  it("refuses a document with no State, and one that is not JSON", () => {
    expect(parseExitState(JSON.stringify({ message: "No such container" }))).toBeNull();
    expect(parseExitState("not json")).toBeNull();
    expect(parseExitState("null")).toBeNull();
  });
});

describe("dockerSocketPath", () => {
  it("follows a unix:// DOCKER_HOST", () => {
    expect(dockerSocketPath({ DOCKER_HOST: "unix:///run/user/1000/docker.sock" })).toBe(
      "/run/user/1000/docker.sock",
    );
  });

  it("declines a tcp:// DOCKER_HOST, leaving it to the CLI and its TLS settings", () => {
    expect(dockerSocketPath({ DOCKER_HOST: "tcp://10.0.0.5:2376" })).toBeNull();
  });
});
