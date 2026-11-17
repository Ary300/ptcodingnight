/**
 * Code completion for the problem editor, in the IntelliJ manner.
 *
 * Three pure functions, so the surface only renders a popup and applies an Edit:
 *
 *   completionContext   what is being typed at the caret, and what qualifies it
 *   completionsFor      the ranked candidates for that context
 *   applyCompletion     the single replacement that accepting one performs
 *
 * The editor does not infer types. After a dot it offers the members the profile lists for that
 * exact qualifier ("System.out", "Math", "std"), followed by the members it offers after anything
 * ("*": length(), size(), charAt() ...). At the top level it offers what the file already names,
 * then keywords, globals and live templates.
 */

import type { CompletionContext, CompletionItem, Edit, EditState, LanguageProfile } from "./types";

/** Matches IntelliJ's popup, which shows about a dozen rows before it scrolls. */
export const DEFAULT_COMPLETION_LIMIT = 12;

/** The shortest identifier from the file worth offering back. One letter is faster to type. */
const MIN_FILE_IDENTIFIER_LENGTH = 2;

/** Where a template body puts the caret, as IntelliJ's live templates spell it. */
const END_MARKER = "$END$";

const IDENT_CHAR = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;
const WORD_RUN = /[A-Za-z0-9_]+/g;
const LEADING_NAME = /^[A-Za-z0-9_$]+/;

const isIdentChar = (ch: string | undefined): boolean => ch !== undefined && IDENT_CHAR.test(ch);
const isDigit = (ch: string | undefined): boolean => ch !== undefined && DIGIT.test(ch);

// ---------------------------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------------------------

/** Whether the line comment marker starts at `i`. "#" before a C++ directive is not a comment. */
function commentStartsAt(line: string, i: number, lineComment: string | undefined): boolean {
  if (lineComment !== undefined) return line.startsWith(lineComment, i);
  if (line.startsWith("//", i)) return true;
  if (line[i] !== "#") return false;
  const isDirective = /^\s*#\s*[a-z]+/.test(line) && line.slice(0, i).trim() === "";
  return !isDirective;
}

/**
 * Whether the end of `line` sits inside a string literal or a comment that this line opened.
 * Quotes toggle, a backslash escapes the next character inside a string, and a block comment
 * opened with "/*" and not closed on the line counts as a comment for the C-family languages.
 */
function endsInStringOrComment(line: string, lineComment: string | undefined): boolean {
  const blockComments = lineComment === undefined || lineComment === "//";
  let quote: string | null = null;
  let inBlock = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inBlock) {
      if (line.startsWith("*/", i)) {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (blockComments && line.startsWith("/*", i)) {
      inBlock = true;
      i += 1;
    } else if (commentStartsAt(line, i, lineComment)) {
      return true;
    }
  }
  return quote !== null || inBlock;
}

/** Index just past the start of the balanced group that closes at `close`, or -1. */
function skipGroupBackward(line: string, close: number): number {
  const closer = line[close];
  const opener = closer === ")" ? "(" : "[";
  let depth = 0;
  for (let i = close; i >= 0; i -= 1) {
    if (line[i] === closer) depth += 1;
    else if (line[i] === opener) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Start of the string literal whose closing quote is at `close`, or -1. */
function skipStringBackward(line: string, close: number): number {
  const quote = line[close];
  for (let i = close - 1; i >= 0; i -= 1) {
    if (line[i] === quote && line[i - 1] !== "\\") return i;
  }
  return -1;
}

/**
 * Start of the expression that ends just before `end` on this line: identifiers joined by ".",
 * "::" or "->", with call arguments, indexes and string literals allowed as links. Returns -1
 * when there is no such expression, or when it is a number (so "3." does not offer members).
 */
function chainStart(line: string, end: number): number {
  let i = end;
  for (;;) {
    const linkEnd = i;
    while (line[i - 1] === ")" || line[i - 1] === "]") {
      const open = skipGroupBackward(line, i - 1);
      if (open < 0) return -1;
      i = open;
    }
    if (line[i - 1] === '"' || line[i - 1] === "'") {
      if (i !== linkEnd) return -1;
      const open = skipStringBackward(line, i - 1);
      if (open < 0) return -1;
      i = open;
    } else {
      while (isIdentChar(line[i - 1])) i -= 1;
      if (isDigit(line[i])) return -1;
    }
    if (i === linkEnd) return -1;
    if (line[i - 1] === ".") i -= 1;
    else if (line.slice(i - 2, i) === "::" || line.slice(i - 2, i) === "->") i -= 2;
    else return i;
  }
}

/** The separator ("." "::" "->") that ends just before `at`, if any. */
function separatorBefore(line: string, at: number): string | null {
  if (line.slice(at - 2, at) === "::") return "::";
  if (line.slice(at - 2, at) === "->") return "->";
  if (line[at - 1] === ".") return ".";
  return null;
}

/**
 * The identifier being typed at the caret, and what qualifies it.
 *
 * `lineComment` is the profile's marker ("//" or "#"). Pass it when the language is known:
 * without it both markers count, so Python's "//" floor division would read as a comment.
 */
export function completionContext(
  text: string,
  caret: number,
  lineComment?: string,
): CompletionContext | null {
  if (caret < 0 || caret > text.length) return null;
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const line = text.slice(lineStart, caret);
  if (endsInStringOrComment(line, lineComment)) return null;

  let start = line.length;
  while (isIdentChar(line[start - 1])) start -= 1;
  if (isDigit(line[start])) return null;
  const prefix = line.slice(start);

  const separator = separatorBefore(line, start);
  if (separator === null) {
    if (prefix === "") return null;
    return { prefix, replaceFrom: lineStart + start, replaceTo: caret, qualifier: null };
  }

  const qualifierEnd = start - separator.length;
  const qualifierBegin = chainStart(line, qualifierEnd);
  let qualifier: string;
  if (qualifierBegin >= 0) {
    qualifier = line.slice(qualifierBegin, qualifierEnd);
  } else if (line.slice(0, qualifierEnd).trim() === "" && separator === ".") {
    // A chained call continued from the line above (".map(...)"): nothing nameable, but still
    // a member access, so the members offered after any qualifier apply.
    qualifier = "";
  } else if (separator === "::" && line.slice(0, qualifierEnd).trim() === "") {
    // "::name" names the global scope in C++; complete it as a top-level identifier.
    if (prefix === "") return null;
    return { prefix, replaceFrom: lineStart + start, replaceTo: caret, qualifier: null };
  } else {
    return null;
  }
  return { prefix, replaceFrom: lineStart + start, replaceTo: caret, qualifier };
}

// ---------------------------------------------------------------------------------------------
// Matching and ranking
// ---------------------------------------------------------------------------------------------

/** The name an item is matched against: the identifier its label starts with. */
function matchKey(item: CompletionItem): string {
  const lead = LEADING_NAME.exec(item.label);
  return lead === null ? item.label : lead[0];
}

/** Indices where a word begins inside an identifier: camelCase, PascalCase and snake_case. */
function humpStarts(name: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < name.length; i += 1) {
    const ch = name.charAt(i);
    const prev = name[i - 1];
    const next = name[i + 1];
    const upper = /[A-Z]/.test(ch);
    if (
      i === 0 ||
      ((prev === "_" || prev === "$") && ch !== "_" && ch !== "$") ||
      (upper && prev !== undefined && /[a-z0-9]/.test(prev)) ||
      (upper &&
        prev !== undefined &&
        /[A-Z]/.test(prev) &&
        next !== undefined &&
        /[a-z]/.test(next))
    ) {
      starts.push(i);
    }
  }
  return starts;
}

const sameLetter = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * IntelliJ's camel-hump match: the pattern splits into runs, each run matches the start of a
 * word in the name, in order. "pI" and "pi" match parseInt; "sb" matches StringBuilder;
 * "MV" matches MAX_VALUE. Letters compare without case, as the examples above require.
 */
export function camelHumpMatches(pattern: string, name: string): boolean {
  if (pattern === "") return true;
  const starts = humpStarts(name);
  const from = (patternIndex: number, hump: number): boolean => {
    const at = starts[hump] ?? name.length;
    for (let k = 0; at + k < name.length && patternIndex + k < pattern.length; k += 1) {
      if (!sameLetter(pattern.charAt(patternIndex + k), name.charAt(at + k))) break;
      const consumed = patternIndex + k + 1;
      if (consumed === pattern.length) return true;
      for (let h = hump + 1; h < starts.length; h += 1) {
        if ((starts[h] ?? -1) > at + k && from(consumed, h)) return true;
      }
    }
    return false;
  };
  return starts.length > 0 && from(0, 0);
}

/** 0 exact-case prefix, 1 any-case prefix, 2 camel hump, null no match. */
function matchTier(prefix: string, key: string): number | null {
  if (key.startsWith(prefix)) return 0;
  if (key.toLowerCase().startsWith(prefix.toLowerCase())) return 1;
  if (camelHumpMatches(prefix, key)) return 2;
  return null;
}

/** Code-unit order, so the ranking is identical on every machine and locale. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A candidate and the group it came from: 0 for the qualifier's own members, 1 for "*". */
interface Candidate {
  readonly item: CompletionItem;
  readonly group: number;
}

function rank(prefix: string, candidates: readonly Candidate[], limit: number): CompletionItem[] {
  const scored = candidates.flatMap((candidate) => {
    const key = matchKey(candidate.item);
    const tier = matchTier(prefix, key);
    return tier === null ? [] : [{ ...candidate, key, tier }];
  });
  const sorted = [...scored].sort(
    (a, b) =>
      a.tier - b.tier ||
      a.group - b.group ||
      a.key.length - b.key.length ||
      byCodeUnit(a.key, b.key) ||
      byCodeUnit(a.item.label, b.item.label),
  );
  return sorted.slice(0, Math.max(0, limit)).map((entry) => entry.item);
}

/** Drops later items with the same label and kind, keeping the first source's version. */
function dedupe(items: readonly CompletionItem[]): CompletionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = `${item.kind}\u0000${item.label}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------------------------

/**
 * Every identifier the file names, two characters or longer, in first-seen order. The word being
 * typed is not one of them: neither the prefix itself nor the run that starts where it starts.
 */
function fileIdentifiers(text: string, ctx: CompletionContext): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(WORD_RUN)) {
    const word = match[0];
    if (match.index === ctx.replaceFrom || word === ctx.prefix) continue;
    if (word.length < MIN_FILE_IDENTIFIER_LENGTH || isDigit(word[0])) continue;
    names.add(word);
  }
  return [...names];
}

function topLevelCandidates(
  ctx: CompletionContext,
  text: string,
  profile: LanguageProfile,
): CompletionItem[] {
  const keywords: CompletionItem[] = profile.keywords.map((word) => ({
    label: word,
    insertText: word,
    kind: "keyword",
  }));
  const known = new Set<string>([...profile.keywords, ...profile.globals.map(matchKey)]);
  const declared: CompletionItem[] = fileIdentifiers(text, ctx)
    .filter((name) => !known.has(name))
    .map((name) => ({ label: name, insertText: name, kind: "variable" }));
  const templates: CompletionItem[] = profile.templates.map((template) => ({
    label: template.abbreviation,
    insertText: template.body,
    kind: "snippet",
    detail: template.description,
  }));
  return dedupe([...declared, ...keywords, ...profile.globals, ...templates]);
}

/**
 * The qualifier's own members, then the members offered after any qualifier. A general member
 * the qualifier already names (print after System.out) is dropped: the specific one is the truth.
 */
function memberCandidates(qualifier: string, profile: LanguageProfile): Candidate[] {
  const specific = dedupe(qualifier === "*" ? [] : (profile.members[qualifier] ?? []));
  const named = new Set(specific.map(matchKey));
  const general = dedupe(profile.members["*"] ?? []).filter((item) => !named.has(matchKey(item)));
  return [
    ...specific.map((item) => ({ item, group: 0 })),
    ...general.map((item) => ({ item, group: 1 })),
  ];
}

/**
 * The candidates for `ctx`, best first: exact-case prefix matches, then any-case prefix
 * matches, then camel-hump matches. Within a tier, the qualifier's own members come before the
 * general ones, then shorter names, then A to Z.
 */
export function completionsFor(
  ctx: CompletionContext,
  text: string,
  profile: LanguageProfile,
  limit: number = DEFAULT_COMPLETION_LIMIT,
): CompletionItem[] {
  const candidates =
    ctx.qualifier === null
      ? topLevelCandidates(ctx, text, profile).map((item) => ({ item, group: 0 }))
      : memberCandidates(ctx.qualifier, profile);
  return rank(ctx.prefix, candidates, limit);
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

/** The leading whitespace of the line that contains `offset`. */
function indentAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lead = /^[ \t]*/.exec(text.slice(lineStart));
  return lead === null ? "" : lead[0];
}

/**
 * A live template body as typed at a line indented by `indent`: continuation lines take that
 * indent, and the caret goes where $END$ was, or at the end when there is none.
 */
export function expandTemplateBody(
  body: string,
  indent: string,
): { readonly text: string; readonly caret: number } {
  const indented = body
    .split("\n")
    .map((line, i) => (i === 0 || line === "" ? line : indent + line))
    .join("\n");
  const marker = indented.indexOf(END_MARKER);
  if (marker < 0) return { text: indented, caret: indented.length };
  const text =
    indented.slice(0, marker) +
    indented
      .slice(marker + END_MARKER.length)
      .split(END_MARKER)
      .join("");
  return { text, caret: marker };
}

/** The one replacement that accepting `item` in `ctx` performs. */
export function applyCompletion(
  state: EditState,
  ctx: CompletionContext,
  item: CompletionItem,
): Edit {
  if (item.kind === "snippet") {
    const expanded = expandTemplateBody(item.insertText, indentAt(state.text, ctx.replaceFrom));
    const caret = ctx.replaceFrom + expanded.caret;
    return {
      from: ctx.replaceFrom,
      to: ctx.replaceTo,
      insert: expanded.text,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }
  const offset = item.caretOffset ?? item.insertText.length;
  const clamped = Math.min(Math.max(offset, 0), item.insertText.length);
  const caret = ctx.replaceFrom + clamped;
  return {
    from: ctx.replaceFrom,
    to: ctx.replaceTo,
    insert: item.insertText,
    selectionStart: caret,
    selectionEnd: caret,
  };
}
