import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { applyCompletion, completionContext, completionsFor } from "@/components/contest/editor/smart/completion";
import { CPP } from "@/components/contest/editor/smart/cpp";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import {
  nextTemplateStop,
  startTemplateSession,
  type TemplateSession,
} from "@/components/contest/editor/smart/template-session";
import type { Edit, EditState, KeyInput, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * The answer keys in fixtures/editor-parity, replayed against the real profiles. Each case is a
 * `before` text, the keys a student presses in IntelliJ, PyCharm or CLion, and the `after` text the
 * IDE leaves, with the caret written "|" and a selection "[...]". `Accept:<label>` picks that row
 * from the completion list. Every case in the three files becomes one test here.
 */

interface ParityCase {
  readonly id: string;
  readonly behavior: string;
  readonly before: string;
  readonly keys: readonly string[];
  readonly after: string;
}

function load(name: string): readonly ParityCase[] {
  const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "fixtures/editor-parity", `${name}.json`), "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${name}.json is not a list`);
  return raw as ParityCase[];
}

function parse(marked: string): EditState {
  const open = marked.indexOf("[");
  const caret = marked.indexOf("|");
  if (caret === -1 && open !== -1) {
    const close = marked.indexOf("]", open);
    const text = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    return { text, selectionStart: open, selectionEnd: close - 1 };
  }
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), selectionStart: caret, selectionEnd: caret };
}

function draw(current: EditState): string {
  const { text, selectionStart: a, selectionEnd: b } = current;
  if (a === b) return `${text.slice(0, a)}|${text.slice(a)}`;
  return `${text.slice(0, a)}[${text.slice(a, b)}]${text.slice(b)}`;
}

function apply(current: EditState, edit: Edit): EditState {
  return {
    text: current.text.slice(0, edit.from) + edit.insert + current.text.slice(edit.to),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  };
}

/** "Mod+/" and "Alt+Shift+ArrowUp" as the surface would see them on Windows. */
function keyInput(name: string): KeyInput {
  const parts = name.length > 1 ? name.split("+") : [name];
  const key = parts[parts.length - 1] ?? name;
  const mods = new Set(parts.slice(0, -1));
  return {
    key: key === "" ? "+" : key,
    shiftKey: mods.has("Shift"),
    altKey: mods.has("Alt"),
    ctrlKey: mods.has("Mod") || mods.has("Ctrl"),
    metaKey: false,
    isMac: false,
  };
}

function browserDefault(current: EditState, input: KeyInput): EditState {
  const { text, selectionStart: a, selectionEnd: b } = current;
  if (input.key === "Backspace") {
    if (a !== b) return { text: text.slice(0, a) + text.slice(b), selectionStart: a, selectionEnd: a };
    if (a === 0) return current;
    return { text: text.slice(0, a - 1) + text.slice(a), selectionStart: a - 1, selectionEnd: a - 1 };
  }
  const ch = input.key === "Enter" ? "\n" : input.key === "Tab" ? "\t" : input.key;
  return { text: text.slice(0, a) + ch + text.slice(b), selectionStart: a + ch.length, selectionEnd: a + ch.length };
}

function accept(current: EditState, label: string, profile: LanguageProfile): EditState {
  const ctx = completionContext(current.text, current.selectionStart, profile.lineComment);
  if (ctx === null) throw new Error(`nothing to complete for ${label}`);
  const items = completionsFor(ctx, current.text, profile, 500);
  // Java keys name the full row ("println(String x)"); Python and C++ keys name the bare identifier.
  const item =
    items.find((candidate) => candidate.label === label) ??
    items.find((candidate) => /^[A-Za-z0-9_$]+/.exec(candidate.label)?.[0] === label);
  if (item === undefined) {
    throw new Error(`${label} not offered; got ${items.map((candidate) => candidate.label).join(", ")}`);
  }
  return apply(current, applyCompletion(current, ctx, item, profile));
}

function replay(testCase: ParityCase, profile: LanguageProfile): string {
  let current = parse(testCase.before);
  let session: TemplateSession | null = null;
  for (const name of testCase.keys) {
    if (name.startsWith("Accept:")) {
      current = accept(current, name.slice("Accept:".length), profile);
      continue;
    }
    const input = keyInput(name);
    if (session !== null && (input.key === "Tab" || input.key === "Enter") && !input.shiftKey) {
      const step = nextTemplateStop(session, current);
      if (step !== null) {
        current = apply(current, step.edit);
        session = step.session;
        continue;
      }
      session = null;
    }
    const edit = handleKey(current, input, profile);
    if (edit === null) {
      current = browserDefault(current, input);
      continue;
    }
    current = apply(current, edit);
    session = startTemplateSession(current.text, edit) ?? session;
  }
  return draw(current);
}

const SUITES: readonly (readonly [string, LanguageProfile])[] = [
  ["java", JAVA],
  ["python", PYTHON],
  ["cpp", CPP],
];

/**
 * Every case in the three keys is replayed, keystroke behaviours (pairs, Enter, comments,
 * Backspace, move and duplicate) as well as completion and templates: a key that only some of its
 * cases were held to let pairs inside strings, escaped quotes and PyCharm's indented comment fail
 * for weeks while this file stayed green.
 */
const NEEDS_ENGINE_VARIABLE: ReadonlySet<string> = new Set<string>();

for (const [name, profile] of SUITES) {
  describe(`${name} parity key`, () => {
    const cases = load(name).filter((testCase) => !NEEDS_ENGINE_VARIABLE.has(testCase.id));
    it("covers every completion case in the key", () => {
      expect(cases.filter((testCase) => testCase.behavior === "completion").length).toBeGreaterThanOrEqual(17);
    });
    for (const testCase of cases) {
      it(`${testCase.behavior}: ${testCase.id}`, () => {
        expect(replay(testCase, profile)).toBe(testCase.after);
      });
    }
  });
}
