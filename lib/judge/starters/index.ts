/**
 * The starter dispatcher: one entry point from a `LanguageId` to the emitter that serves it.
 *
 * A starter is the template code a student sees already in the editor the first time they open a
 * problem: the function stub they complete, plus the visible stdin-to-stdout harness that reads
 * the input and prints the answer. It exists because the organizer asked for it, in these words:
 * "just to make it simpler for people not as familiar with BufferedReader or stdout".
 *
 * ## The two invariants this file is here to hold
 *
 * **Dispatch is on `VARIANTS[language].sourceFile`, never on the `LanguageId`.** There are ten
 * language choices and six emitters, because a variant is a set of compile flags on top of a
 * runtime: `CPP_11` and `CPP_17` both produce `main.cpp` and so share one emitter, and Java's
 * four language levels all produce `Main.java`. Keying on the source file is what makes "one C++
 * emission serves both C++ variants" true by construction rather than by four table rows that
 * have to be kept equal. Adding C++20 to `lib/judge/runtimes.ts` needs no change here at all.
 *
 * **The canonical `Signature` is the schema's**, `SignatureSchema` in `lib/schemas/seed.ts`. The
 * six emitters each re-state that shape structurally instead of importing it, deliberately, so
 * that an emitter stays a pure function of plain data with no schema dependency. That is only
 * safe if somebody checks the two still agree — and this file is that check: `EMITTERS` is typed
 * as `(signature: Signature) => string`, so an emitter whose declared parameter drifts from the
 * schema stops being assignable and G1 fails. The drift this prevents is the one
 * `components/admin/contract.ts` demonstrated, where a hand-written copy of a server type quietly
 * described a response that no longer existed.
 *
 * Pure, like the emitters it dispatches to. No I/O, no clock, no randomness.
 */

import { LANGUAGE_IDS, VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import type { Signature } from "@/lib/schemas/seed";

import { emitC, emitCProbe } from "./c";
import { emitCpp, emitCppProbe } from "./cpp";
import { emitGo, emitGoProbe } from "./go";
import { emitJava, emitJavaProbe } from "./java";
import { emitJavaScript, emitJavaScriptProbe } from "./javascript";
import { emitPython, emitPythonProbe } from "./python";

export type {
  Signature,
  SignatureField,
  SignatureReturn,
  SignatureType,
} from "@/lib/schemas/seed";
export {
  expectedEchoLines,
  isOrderedSubsequence,
  traceHarness,
  HarnessTraceError,
  type HarnessTrace,
  type TraceCall,
} from "./trace";

/** The starter and its probe build. Both are pure functions of the declaration. */
interface Emitters {
  /** The file pre-filled into the editor. */
  readonly starter: (signature: Signature) => string;
  /**
   * The same file with echo statements spliced into the stub, the zero return left in place.
   * G13 judges one of these per language: it proves the starter compiles (the probe CONTAINS
   * the stub verbatim) and that this harness reads the token stream in the declared order.
   */
  readonly probe: (signature: Signature) => string;
}

/** Every source file the six emitters produce. Matches `VARIANTS[...].sourceFile` exactly. */
const EMITTERS: Readonly<Record<string, Emitters>> = {
  "main.py": { starter: emitPython, probe: emitPythonProbe },
  "Main.java": { starter: emitJava, probe: emitJavaProbe },
  "main.c": { starter: emitC, probe: emitCProbe },
  "main.cpp": { starter: emitCpp, probe: emitCppProbe },
  "main.js": { starter: emitJavaScript, probe: emitJavaScriptProbe },
  "main.go": { starter: emitGo, probe: emitGoProbe },
};

/**
 * One representative language per emitter, in registry order.
 *
 * The probe pass judges emitters, not variants: `CPP_11` and `CPP_17` compile the same generated
 * `main.cpp`, so judging both would buy a second measurement of the same file. Derived rather
 * than listed, so a new variant on an existing runtime never needs a line here.
 */
export const PROBE_LANGUAGES: readonly LanguageId[] = LANGUAGE_IDS.filter((language, index) => {
  const sourceFile = VARIANTS[language].sourceFile;
  return LANGUAGE_IDS.findIndex((other) => VARIANTS[other].sourceFile === sourceFile) === index;
});

/**
 * Languages the registry can run but no emitter serves.
 *
 * Always empty today, and checked rather than assumed: adding a runtime to
 * `lib/judge/runtimes.ts` without adding an emitter here would otherwise surface as a student
 * picking Rust and getting an empty editor on a problem whose other nine languages are
 * pre-filled. G13 asserts this is empty.
 */
export function languagesWithoutStarter(): LanguageId[] {
  return LANGUAGE_IDS.filter((language) => EMITTERS[VARIANTS[language].sourceFile] === undefined);
}

function emittersFor(language: LanguageId): Emitters {
  const emitters = EMITTERS[VARIANTS[language].sourceFile];
  if (emitters === undefined) {
    throw new Error(
      `no starter emitter for ${language} (source file "${VARIANTS[language].sourceFile}"). ` +
        `Add one to lib/judge/starters/ and register it here.`,
    );
  }
  return emitters;
}

/** The complete, compilable file to pre-fill into the editor for one language. */
export function starterFor(signature: Signature, language: LanguageId): string {
  return emittersFor(language).starter(signature);
}

/** The probe build of that same file. See `Emitters.probe`. */
export function probeFor(signature: Signature, language: LanguageId): string {
  return emittersFor(language).probe(signature);
}

/** One language's starter, as it travels to the editor on `ProblemDetail.starters`. */
export interface StarterCode {
  readonly language: LanguageId;
  readonly code: string;
}

/**
 * Every starter a problem offers, ready to put on the wire.
 *
 * Returns `[]` for a problem with no signature — which is most of the bank, and is not a
 * degraded case: it is the behaviour every problem had before this feature, a raw stdin-to-stdout
 * program in an empty editor. The editor shows a starter when there is one and an empty buffer
 * when there is not.
 *
 * `languages` is the problem's `allowedLanguages` and nothing else. Generating a starter for a
 * language the problem does not allow would put code in front of a student that they cannot
 * submit.
 *
 * Ordered by the registry's `LANGUAGE_IDS`, which is also the dropdown order, so the same problem
 * always serialises to the same bytes. An array that comes out of a database in whatever order
 * Postgres felt like is the bug that shipped in team standings once already.
 */
export function startersFor(
  signature: Signature | null | undefined,
  languages: readonly LanguageId[],
): StarterCode[] {
  if (signature === null || signature === undefined) return [];

  const allowed = new Set(languages);
  return LANGUAGE_IDS.filter((language) => allowed.has(language)).map((language) => ({
    language,
    code: starterFor(signature, language),
  }));
}
