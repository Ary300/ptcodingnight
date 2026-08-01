/**
 * A pure model of what the generated harness DOES to a token stream.
 *
 * The six emitters in this directory produce six programs that must all read the same tokens in
 * the same order. This file reads them itself, in TypeScript, from the same declaration — so the
 * question "does this signature match the problem's real input format?" can be answered without
 * a container, a compiler, or a student.
 *
 * ## Why this exists as a separate thing from the emitters
 *
 * A signature is data, authored by hand in `content/problems/<slug>/problem.json`, and the
 * failure it invites is not a code bug: it is a declaration that reads six tokens where the file
 * has five. Every emitter then generates a *correct* harness for a *wrong* declaration, every
 * gate that compiles code passes, and the error arrives as WA on a student's first submission of
 * the night, in whichever language they picked. `traceHarness` turns that into a G13 failure
 * (`scripts/verify-problem-content.ts`), which is a gate rather than a person.
 *
 * It also produces the expected ECHO LINES for the probe pass. The probe programs print each
 * argument they were handed, in declaration order; this computes what those lines must say for a
 * given input file, so the probe has an independent expectation rather than six implementations
 * agreeing with one another.
 *
 * Pure: no I/O, no Date.now(), no randomness — the rule `lib/scoring/` lives under, for the same
 * reason. The output is compared byte for byte.
 */

import type { Signature, SignatureField, SignatureType } from "@/lib/schemas/seed";

/** One call the harness makes to the student's function. */
export interface TraceCall {
  /**
   * What a probe build prints for this call: one line per PASSED argument, in declaration
   * order. Shared arguments are repeated on every call, exactly as the harness passes them.
   */
  readonly echoes: readonly string[];
}

export interface HarnessTrace {
  readonly calls: readonly TraceCall[];
  /** Tokens the harness consumed. A correct signature consumes the whole file. */
  readonly consumed: number;
}

/** Thrown when the declaration and the token stream disagree. Carries a readable reason. */
export class HarnessTraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessTraceError";
  }
}

/**
 * Element type of each array type. A lookup rather than `type.slice(0, -2) as SignatureType`,
 * because the cast would keep compiling if the vocabulary ever grew a type this file cannot
 * read, and the table does not.
 */
const ELEMENT_OF: Readonly<Partial<Record<SignatureType, SignatureType>>> = {
  "int[]": "int",
  "long[]": "long",
  "string[]": "string",
};

function isArrayType(type: SignatureType): boolean {
  return ELEMENT_OF[type] !== undefined;
}

function isPassed(field: SignatureField): boolean {
  return field.passed !== false;
}

/**
 * How a probe renders one value.
 *
 * Integers are re-emitted through `BigInt`, not `Number`: a `long` may legitimately be 10^12 and
 * beyond, and the point of this function is to say what a Java `long` or a C `long long` prints.
 * Going via a double would be the exact truncation the `long` type exists to avoid. It also
 * normalises what every target language normalises anyway — `007` prints as `7`, `-0` as `0`.
 */
function renderScalar(type: SignatureType, token: string): string {
  if (type === "string") return token;
  if (!/^[+-]?\d+$/.test(token)) {
    throw new HarnessTraceError(`expected an integer for a ${type} field, got "${token}"`);
  }
  return BigInt(token).toString();
}

interface Cursor {
  readonly tokens: readonly string[];
  position: number;
}

function take(cursor: Cursor, field: SignatureField, what: string): string {
  const token = cursor.tokens[cursor.position];
  if (token === undefined) {
    throw new HarnessTraceError(
      `input ran out while reading ${what} of "${field.name}": the harness wanted token ` +
        `${String(cursor.position + 1)} and the file has ${String(cursor.tokens.length)}`,
    );
  }
  cursor.position += 1;
  return token;
}

/**
 * The element count for an array field: a literal, or the value already read into an earlier
 * `int` field. `SignatureSchema` guarantees one of the two, so anything else here means the
 * declaration bypassed validation.
 */
function lengthOf(field: SignatureField, values: ReadonlyMap<string, string>): number {
  if (typeof field.length === "number") return field.length;
  if (typeof field.length === "string") {
    const bound = values.get(field.length);
    if (bound === undefined) {
      throw new HarnessTraceError(
        `length "${field.length}" of "${field.name}" names a field that was not read first`,
      );
    }
    const count = Number(bound);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new HarnessTraceError(
        `length "${field.length}" of "${field.name}" read the value "${bound}", ` +
          `which is not a usable element count`,
      );
    }
    return count;
  }
  throw new HarnessTraceError(`array field "${field.name}" declares no length`);
}

/**
 * Read one field, returning the line a probe prints for it.
 *
 * The array form is `<count>:` then a space and an element, per element — the format all six
 * emitters agree on. An EMPTY array is where they part company: five of them print `0:` and the
 * Python emitter prints `0: `, because it builds the line by concatenation. Callers compare with
 * trailing whitespace stripped, which is why that difference has never mattered; it is recorded
 * here so nobody reintroduces it as a bug on the first problem that reads an empty array.
 */
function readField(
  field: SignatureField,
  cursor: Cursor,
  values: Map<string, string>,
): string {
  if (!isArrayType(field.type)) {
    const token = take(cursor, field, "the value");
    values.set(field.name, token);
    return renderScalar(field.type, token);
  }

  const count = lengthOf(field, values);
  const element = ELEMENT_OF[field.type];
  if (element === undefined) {
    throw new HarnessTraceError(`"${field.name}" has no element type for "${field.type}"`);
  }
  const rendered: string[] = [];
  for (let index = 0; index < count; index += 1) {
    rendered.push(renderScalar(element, take(cursor, field, `element ${String(index + 1)}`)));
  }
  return `${String(count)}:${rendered.map((value) => ` ${value}`).join("")}`;
}

/**
 * Walk a signature over a token stream exactly as the generated harness does.
 *
 * @throws HarnessTraceError when the stream runs out or a count is unusable. It does NOT throw
 *   on leftover tokens — that is the caller's judgement, because `consumed` is the fact and
 *   "the file has more" is the policy.
 */
export function traceHarness(signature: Signature, tokens: readonly string[]): HarnessTrace {
  const cursor: Cursor = { tokens, position: 0 };
  const values = new Map<string, string>();

  const sharedEchoes: string[] = [];
  for (const field of signature.shared ?? []) {
    const line = readField(field, cursor, values);
    if (isPassed(field)) sharedEchoes.push(line);
  }

  const repeatCount = repeatsFor(signature, values);
  const calls: TraceCall[] = [];
  for (let call = 0; call < repeatCount; call += 1) {
    const echoes = [...sharedEchoes];
    for (const field of signature.params) {
      const line = readField(field, cursor, values);
      if (isPassed(field)) echoes.push(line);
    }
    calls.push({ echoes });
  }

  return { calls, consumed: cursor.position };
}

/** How many times the params block is read. Absent `repeat` means exactly once. */
function repeatsFor(signature: Signature, values: ReadonlyMap<string, string>): number {
  if (signature.repeat === undefined) return 1;

  const bound = values.get(signature.repeat);
  if (bound === undefined) {
    throw new HarnessTraceError(`repeat "${signature.repeat}" was not read from shared`);
  }
  const count = Number(bound);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new HarnessTraceError(
      `repeat "${signature.repeat}" read the value "${bound}", which is not a usable count`,
    );
  }
  return count;
}

/** Every echo line a probe build prints, in order, flattened across calls. */
export function expectedEchoLines(trace: HarnessTrace): string[] {
  return trace.calls.flatMap((call) => call.echoes);
}

/**
 * `true` when `expected` appears inside `actual` in order, allowing extra lines between.
 *
 * The probe pass needs this rather than equality because the six harnesses flush differently and
 * the emitters say so: Java, Python, Go, C++ and JavaScript accumulate every call's result and
 * write once at the end, while the C harness prints each result as it goes. So the echo lines
 * are the same lines in the same order in all six, and only the (empty or zero) RESULT lines
 * move. Requiring a subsequence, and separately requiring the line count to be exactly the
 * echoes plus one result per call, pins both orderings without blessing either.
 */
export function isOrderedSubsequence(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  let index = 0;
  for (const line of actual) {
    if (index < expected.length && line === expected[index]) index += 1;
  }
  return index === expected.length;
}
