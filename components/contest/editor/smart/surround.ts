import type { Edit, EditState, LanguageProfile } from "./types";

/**
 * Surround With (Cmd+Option+T, Ctrl+Alt+T): wraps the selected lines, or the caret's line, in a
 * block. The body moves in one indent level, the header and footer sit at the first line's indent,
 * and the condition is selected so typing replaces it, as IntelliJ, PyCharm and CLion do.
 *
 * Minimal version written by the commands group against the agreed signature
 * `surround(state, kind, profile): Edit | null`; the engine group's version replaces it.
 */

export type SurroundKind = "if" | "ifElse" | "while" | "doWhile" | "for" | "tryCatch" | "tryFinally" | "block";

export interface SurroundChoice {
  readonly kind: SurroundKind;
  readonly label: string;
}

const BRACE_CHOICES: readonly SurroundChoice[] = [
  { kind: "if", label: "if" },
  { kind: "ifElse", label: "if / else" },
  { kind: "while", label: "while" },
  { kind: "doWhile", label: "do / while" },
  { kind: "for", label: "for" },
];

/** The choices, numbered in the popup in this order. */
export function surroundChoicesFor(profile: LanguageProfile): readonly SurroundChoice[] {
  if (profile.id === "python") {
    return [
      { kind: "if", label: "if" },
      { kind: "ifElse", label: "if / else" },
      { kind: "while", label: "while" },
      { kind: "for", label: "for" },
      { kind: "tryCatch", label: "try / except" },
      { kind: "tryFinally", label: "try / finally" },
    ];
  }
  if (profile.id === "java") {
    return [...BRACE_CHOICES, { kind: "tryCatch", label: "try / catch" }, { kind: "tryFinally", label: "try / finally" }];
  }
  return [...BRACE_CHOICES, { kind: "tryCatch", label: "try / catch" }, { kind: "block", label: "{ }" }];
}

interface Shape {
  /** Lines before the body; `$C$` marks the selected placeholder. */
  readonly head: readonly string[];
  readonly tail: readonly string[];
  /** The placeholder text, selected after the edit. */
  readonly placeholder: string;
}

function braceShape(kind: SurroundKind, profile: LanguageProfile): Shape | null {
  const java = profile.id === "java";
  switch (kind) {
    case "if":
      return { head: ["if ($C$) {"], tail: ["}"], placeholder: "condition" };
    case "ifElse":
      return { head: ["if ($C$) {"], tail: ["} else {", "}"], placeholder: "condition" };
    case "while":
      return { head: ["while ($C$) {"], tail: ["}"], placeholder: "condition" };
    case "doWhile":
      return { head: ["do {"], tail: ["} while ($C$);"], placeholder: "condition" };
    case "for":
      return { head: ["for (int i = 0; i < $C$; i++) {"], tail: ["}"], placeholder: "n" };
    case "tryCatch":
      return java
        ? { head: ["try {"], tail: ["} catch ($C$ e) {", "}"], placeholder: "Exception" }
        : { head: ["try {"], tail: ["} catch ($C$& e) {", "}"], placeholder: "const std::exception" };
    case "tryFinally":
      return java ? { head: ["try {"], tail: ["} finally {", "$C$", "}"], placeholder: "" } : null;
    case "block":
      return java ? null : { head: ["{$C$"], tail: ["}"], placeholder: "" };
    default:
      return null;
  }
}

function pythonShape(kind: SurroundKind): Shape | null {
  switch (kind) {
    case "if":
      return { head: ["if $C$:"], tail: [], placeholder: "condition" };
    case "ifElse":
      return { head: ["if $C$:"], tail: ["else:", "\tpass"], placeholder: "condition" };
    case "while":
      return { head: ["while $C$:"], tail: [], placeholder: "condition" };
    case "for":
      return { head: ["for $C$ in range(n):"], tail: [], placeholder: "i" };
    case "tryCatch":
      return { head: ["try:"], tail: ["except $C$:", "\tpass"], placeholder: "Exception" };
    case "tryFinally":
      return { head: ["try:"], tail: ["finally:", "\t$C$pass"], placeholder: "" };
    default:
      return null;
  }
}

/** Wraps the lines the selection touches. Null when `kind` does not exist for the language. */
export function surround(state: EditState, kind: SurroundKind, profile: LanguageProfile): Edit | null {
  const shape = profile.id === "python" ? pythonShape(kind) : braceShape(kind, profile);
  if (shape === null) return null;

  const { text, selectionStart, selectionEnd } = state;
  const from = text.lastIndexOf("\n", selectionStart - 1) + 1;
  // A selection ending at column 0 of the next line does not take that line with it.
  const endAt = selectionEnd > selectionStart && text[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
  const lineEnd = text.indexOf("\n", endAt);
  const to = lineEnd === -1 ? text.length : lineEnd;

  const lines = text.slice(from, to).split("\n");
  const indent = /^[ \t]*/.exec(lines[0] ?? "")?.[0] ?? "";
  const unit = profile.indentUnit;
  const body = lines.map((line) => (line.trim() === "" ? line : unit + line));
  const frame = (line: string): string => indent + line.replace(/^\t/, unit);
  const all = [...shape.head.map(frame), ...body, ...shape.tail.map(frame)].join("\n");

  const marker = all.indexOf("$C$");
  const insert = all.replace("$C$", shape.placeholder);
  const start = from + (marker === -1 ? insert.length : marker);
  return { from, to, insert, selectionStart: start, selectionEnd: start + (marker === -1 ? 0 : shape.placeholder.length) };
}
