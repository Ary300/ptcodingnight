import { describe, expect, it } from "vitest";

import { greetingFor } from "@/components/contest/lobby/LobbyView";

describe("greetingFor", () => {
  it("greets a student by first name", () => {
    expect(greetingFor("Katherine Johnson", false)).toBe("Hi Katherine, welcome to Coding Night.");
    expect(greetingFor("  Ada  ", false)).toBe("Hi Ada, welcome to Coding Night.");
  });

  it("names the practice problems in the arena", () => {
    expect(greetingFor("Grace Hopper", true)).toBe("Hi Grace, welcome to the practice problems.");
  });

  it("does not greet a practice guest as Guest", () => {
    expect(greetingFor("Guest 4821", true)).toBe("Welcome to the practice problems.");
  });

  it("falls back when there is no name", () => {
    expect(greetingFor("   ", false)).toBe("Welcome to Coding Night.");
  });
});
