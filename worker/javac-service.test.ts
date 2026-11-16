import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VARIANTS } from "@/lib/judge/runtimes";

import { JAVAC_SERVICE_JVM_FLAGS, javacArguments } from "./javac-service";

const SERVICE = readFileSync(
  path.join(process.cwd(), "worker", "javac-service", "ptcn", "javac", "Service.java"),
  "utf8",
);

describe("the warm javac gets javac's own arguments", () => {
  it("passes the registry's compile command, launcher -J options aside", () => {
    const command = VARIANTS.JAVA_21.compileCommand ?? "";
    const args = javacArguments(command);
    expect(args).toEqual(["--release", "21", "-proc:none", "-nowarn", "-d", "/build", "/work/Main.java"]);
    // Everything else in the command is a -J option, which tunes the JVM and not javac.
    expect(command.split(/\s+/).filter((w) => w !== "javac" && !args.includes(w)).every((w) => w.startsWith("-J"))).toBe(true);
  });

  it("refuses anything that is not a javac command", () => {
    expect(() => javacArguments("g++ main.cpp")).toThrow();
  });

  it("is used only where the registry asks for it, and only with -proc:none", () => {
    const using = Object.values(VARIANTS).filter((v) => v.compileService === "javac");
    expect(using.map((v) => v.id)).toEqual(["JAVA_21"]);
    expect(SERVICE).toContain('contains("-proc:none")');
  });

  it("runs javac through the launcher's own entry point at the launcher's paths", () => {
    expect(SERVICE).toContain("com.sun.tools.javac.Main.compile(javacArgs, out)");
    expect(SERVICE).toContain('private static final String SOURCE = "/work/Main.java";');
    expect(SERVICE).toContain("empty(WORK);");
    expect(SERVICE).toContain("empty(BUILD);");
  });

  it("tunes only the service JVM, with the per-submission javac's own C1-only choice", () => {
    expect(JAVAC_SERVICE_JVM_FLAGS).toContain("-XX:TieredStopAtLevel=1");
    expect(VARIANTS.JAVA_21.compileCommand).toContain("-J-XX:TieredStopAtLevel=1");
  });
});
