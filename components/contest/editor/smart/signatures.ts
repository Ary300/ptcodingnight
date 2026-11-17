import type { CompletionItem, EditState, LanguageProfile } from "./types";

/**
 * Parameter Info (Cmd+P, Ctrl+P): the signatures known for the call the caret is inside, and which
 * argument the caret is on, counted by top-level commas.
 *
 * Minimal version written by the commands group against the agreed name `signaturesFor`; the
 * completion group's version, with real parameter lists in the profiles, replaces it.
 */

export interface SignatureHelp {
  /** The called name, e.g. "max". */
  readonly name: string;
  /** Each known signature as shown, e.g. "max(int a, int b)". */
  readonly signatures: readonly string[];
  /** 0-based argument the caret is on. */
  readonly activeParameter: number;
}

const OPEN = new Set(["(", "[", "{"]);
const CLOSE = new Set([")", "]", "}"]);

/** The unmatched "(" before `caret` and the commas at its depth, or null. */
function enclosingCall(text: string, caret: number): { open: number; commas: number } | null {
  let depth = 0;
  let commas = 0;
  for (let index = caret - 1; index >= 0; index -= 1) {
    const ch = text[index] ?? "";
    if (ch === "\n" && depth === 0 && text.slice(index + 1, caret).trim() === "") return null;
    if (ch === ";" && depth === 0) return null;
    if (CLOSE.has(ch)) depth += 1;
    else if (OPEN.has(ch)) {
      if (depth === 0) return ch === "(" ? { open: index, commas } : null;
      depth -= 1;
    } else if (ch === "," && depth === 0) commas += 1;
  }
  return null;
}

function nameOf(item: CompletionItem): string {
  return /^[A-Za-z_$][\w$]*/.exec(item.insertText)?.[0] ?? item.insertText;
}

export function signaturesFor(state: EditState, profile: LanguageProfile): SignatureHelp | null {
  const call = enclosingCall(state.text, state.selectionStart);
  if (call === null) return null;
  const before = state.text.slice(0, call.open);
  const match = /((?:[A-Za-z_$][\w$]*\s*(?:\.|::|->)\s*)*)([A-Za-z_$][\w$]*)\s*$/.exec(before);
  if (match === null || match[2] === undefined) return null;
  const name = match[2];
  const qualifier = (match[1] ?? "").replace(/\s+/g, "").replace(/(\.|::|->)$/, "");

  const pools: (readonly CompletionItem[])[] =
    qualifier === "" ? [profile.globals] : [profile.members[qualifier] ?? [], profile.members["*"] ?? []];
  const signatures = pools
    .flat()
    .filter((item) => nameOf(item) === name && item.label.includes("("))
    .map((item) => item.label);
  const unique = [...new Set(signatures)];
  if (unique.length === 0) return null;
  return { name, signatures: unique, activeParameter: call.commas };
}
