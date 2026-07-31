/**
 * Required environment for the G7 suite — and the reason a missing variable is a HARD FAILURE.
 *
 * ## The failure mode this exists to prevent
 *
 * Four specs used to open with `test.skip(ADMIN_PASSCODE === "", "ADMIN_PASSCODE is not set")`.
 * That reads as defensive, and it is the opposite. An unset variable made those four specs
 * **vanish**, and Playwright still printed a green run — a smaller number of passing specs, which
 * nobody compares against yesterday's number. The admin surface is exactly the part a fresh
 * deployment is most likely to get wrong, and it was the part that quietly stopped being tested
 * when the deployment got it wrong.
 *
 * `CLAUDE.md` already bans `.skip`, `.todo` and `.only` as ways to make a gate green. A
 * conditional skip is the same act with a plausible excuse attached: the gate reports PASS while
 * proving less than it says it proves.
 *
 * So: absent variable, loud stop, naming the variable and what to do about it. A suite that cannot
 * test the admin surface must not be able to claim it did.
 */

/** Everything the E2E suite needs from the environment, and why, so the error can say so. */
export const REQUIRED_E2E_ENV: readonly { readonly name: string; readonly why: string }[] = [
  {
    name: "ADMIN_PASSCODE",
    why: "every admin step authenticates with it — login, freeze, unfreeze, verdict override, side-activity points and roster moves",
  },
];

/** Blank counts as absent. An empty string is what a half-written `.env` produces. */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/** The names of every required variable that is missing or blank, in declaration order. */
export function missingE2EEnv(source: NodeJS.ProcessEnv = process.env): readonly string[] {
  return REQUIRED_E2E_ENV.filter((entry) => isBlank(source[entry.name])).map((entry) => entry.name);
}

/**
 * The message a person reads at 11pm on a server they just built. It names the variable, says what
 * cannot be tested without it, and gives the fix — rather than "1 skipped".
 */
export function missingE2EEnvMessage(source: NodeJS.ProcessEnv = process.env): string | null {
  const missing = REQUIRED_E2E_ENV.filter((entry) => isBlank(source[entry.name]));
  if (missing.length === 0) return null;

  const lines = missing.map((entry) => `  - ${entry.name}: ${entry.why}`);
  return [
    `The E2E suite (G7) cannot run: ${String(missing.length)} required environment ${
      missing.length === 1 ? "variable is" : "variables are"
    } missing or blank.`,
    "",
    ...lines,
    "",
    "Set them in the .env file this suite loads (`cp .env.example .env` locally, or the",
    "deployment's own .env on a server) and run the gate again.",
    "",
    "This is deliberately a failure and not a skip. Skipping would drop the admin specs and",
    "still print a green run, which is the exact outcome the no-skip rule exists to prevent.",
  ].join("\n");
}

/**
 * Read one required variable, or throw naming it.
 *
 * Returns `string` rather than `string | undefined`, so a spec that uses it needs no `?? ""`
 * fallback — and the empty-string default that made the conditional skips possible has nowhere
 * left to live.
 */
export function requiredEnv(name: string, source: NodeJS.ProcessEnv = process.env): string {
  // Inlined rather than calling `isBlank`, so the compiler narrows `value` to `string` on the
  // way out instead of needing a cast to say what the check already proved.
  const value = source[name];
  if (value === undefined || value.trim() === "") {
    const known = REQUIRED_E2E_ENV.find((entry) => entry.name === name);
    const why = known === undefined ? "" : ` — ${known.why}`;
    throw new Error(
      `${name} is not set${why}. Set it in .env and run the gate again. ` +
        "This spec fails rather than skipping, so an unset variable cannot pass as a green run.",
    );
  }
  return value;
}
