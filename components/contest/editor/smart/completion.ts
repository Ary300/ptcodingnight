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

import { withImport } from "./imports";
import { inferType } from "./infer";
import { fileMembers } from "./members";
import { renderTemplate, templateParts } from "./template";
import { templateFits } from "./template-context";
import { resolveMacros } from "./template-macros";
import type { CompletionContext, CompletionItem, Edit, EditState, LanguageProfile } from "./types";

/** Matches IntelliJ's popup, which shows about a dozen rows before it scrolls. */
export const DEFAULT_COMPLETION_LIMIT = 12;

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

const PY_IMPORT_MODULE = /^\s*(?:import|from)\s+(\w*)$/;
const PY_FROM_IMPORT = /^\s*from\s+([\w.]+)\s+import\s+(?:[\w\s,]*,\s*)?(\w*)$/;
const JAVA_IMPORT_PATH = /^\s*import\s+(?:static\s+)?((?:\w+\.)*)(\w*)$/;
const CPP_INCLUDE_PATH = /^\s*#\s*include\s*<([\w/.+]*)$/;

/**
 * Inside an import statement or after "#include <": the module, package or header being named.
 * Python's "import he|" asks for a module (qualifier "#modules"), "from collections import de|"
 * for that module's names; Java's "import java.util.Arr|" for that package's classes.
 */
function importStatementContext(line: string, lineStart: number, lineComment: string | undefined): CompletionContext | null {
  const caret = lineStart + line.length;
  if (lineComment !== "#") {
    const include = CPP_INCLUDE_PATH.exec(line);
    if (include !== null) {
      const prefix = include[1] ?? "";
      return { prefix, replaceFrom: caret - prefix.length, replaceTo: caret, qualifier: "#include", scope: "include" };
    }
  }
  if (lineComment === "#") {
    const from = PY_FROM_IMPORT.exec(line);
    if (from !== null) {
      const prefix = from[2] ?? "";
      return { prefix, replaceFrom: caret - prefix.length, replaceTo: caret, qualifier: from[1] ?? "", scope: "import" };
    }
    const moduleMatch = PY_IMPORT_MODULE.exec(line);
    if (moduleMatch !== null) {
      const prefix = moduleMatch[1] ?? "";
      return { prefix, replaceFrom: caret - prefix.length, replaceTo: caret, qualifier: "#modules", scope: "import" };
    }
    return null;
  }
  const java = lineComment === "//" ? JAVA_IMPORT_PATH.exec(line) : null;
  if (java !== null) {
    const prefix = java[2] ?? "";
    const qualifier = (java[1] ?? "").replace(/\.$/, "") || "#packages";
    return { prefix, replaceFrom: caret - prefix.length, replaceTo: caret, qualifier, scope: "import" };
  }
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
  const special = importStatementContext(line, lineStart, lineComment);
  if (special !== null) return special;
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

/**
 * 0 the whole name exactly as typed, 1 exact-case prefix, 2 any-case prefix, 3 camel hump, null
 * no match. The exact match outranks everything, so a name the student has typed in full stays
 * the top row: accepting it changes nothing, and Enter after `return n` is a newline, never `not`.
 */
function matchTier(prefix: string, key: string): number | null {
  if (key === prefix) return 0;
  if (key.startsWith(prefix)) return 1;
  if (key.toLowerCase().startsWith(prefix.toLowerCase())) return 2;
  if (camelHumpMatches(prefix, key)) return 3;
  return null;
}

/** Code-unit order, so the ranking is identical on every machine and locale. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A candidate and the group it came from. After a qualifier: 0 for the qualifier's own members,
 * 1 for members the file itself defines, 2 for the general "*" members. At the top level: 0.
 */
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
      (b.item.priority ?? 0) - (a.item.priority ?? 0) ||
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
 * Every identifier the file names, in first-seen order, one-letter names included: `n`, `i` and
 * `a` are the names contest code uses most, and leaving them out let a keyword take the top row
 * after `return n`. The word being typed is left out only where it is being typed (the run that
 * starts at the caret's word), so a name declared elsewhere in the file is offered even when the
 * prefix already spells it in full.
 */
function fileIdentifiers(text: string, ctx: CompletionContext): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(WORD_RUN)) {
    const word = match[0];
    if (match.index === ctx.replaceFrom || isDigit(word[0])) continue;
    names.add(word);
  }
  return [...names];
}

/** What accepting `word` from the popup inserts: the keyword and the tail its profile gives it. */
function keywordItem(word: string, profile: LanguageProfile): CompletionItem {
  const tail = profile.keywordTails?.[word];
  if (tail === undefined) return { label: word, insertText: word, kind: "keyword" };
  const caret = tail.indexOf("|");
  const clean = tail.replace("|", "");
  return caret === -1
    ? { label: word, insertText: word + clean, kind: "keyword" }
    : { label: word, insertText: word + clean, kind: "keyword", caretOffset: word.length + caret };
}

const PY_DEF = /^[ \t]*def[ \t]+([A-Za-z_]\w*)[ \t]*\(([^)]*)\)/gm;
const BRACE_METHOD = /\b[\w<>[\],]+[ \t]+([A-Za-z_]\w*)[ \t]*\(([^)]*)\)[ \t]*(?:const[ \t]*)?(?:throws[^{;]*)?\{/g;

/**
 * Functions the file defines, as calls: the caret goes inside "()" when the function takes
 * parameters (`self` aside) and after it when it takes none, as PyCharm, IntelliJ and CLion do.
 */
function fileFunctions(text: string, profile: LanguageProfile): CompletionItem[] {
  const keywords = new Set(profile.keywords);
  const pattern = profile.id === "python" ? PY_DEF : BRACE_METHOD;
  const seen = new Map<string, CompletionItem>();
  for (const match of text.matchAll(pattern)) {
    const name = match[1] ?? "";
    if (keywords.has(name) || seen.has(name) || name === "main") continue;
    const params = (match[2] ?? "")
      .split(",")
      .map((param) => param.trim())
      .filter((param) => param !== "" && param !== "self" && param !== "void");
    const insertText = `${name}()`;
    seen.set(name, {
      label: insertText,
      insertText,
      kind: "function",
      caretOffset: params.length > 0 ? name.length + 1 : insertText.length,
    });
  }
  return [...seen.values()];
}

/** Text before `at` on its line, enough to see a `new ` in front of the word. */
const textBefore = (text: string, at: number): string => text.slice(Math.max(0, at - 40), at);
const AFTER_NEW = /\bnew\s+$/;

/** The Java types offered after `new `, as IntelliJ's constructor completion offers them. */
function constructorCandidates(ctx: CompletionContext, text: string, profile: LanguageProfile): CompletionItem[] {
  if (profile.id !== "java" || !AFTER_NEW.test(textBefore(text, ctx.replaceFrom))) return [];
  return profile.globals.filter((item) => item.kind === "type" && item.label !== "Math" && item.label !== "System");
}

function topLevelCandidates(
  ctx: CompletionContext,
  text: string,
  profile: LanguageProfile,
): CompletionItem[] {
  const constructors = constructorCandidates(ctx, text, profile);
  if (constructors.length > 0) return constructors;
  const keywords: CompletionItem[] = profile.keywords
    .filter((word) => !(profile.id === "java" && NEVER_OFFERED_JAVA.has(word)))
    .map((word) => keywordItem(word, profile));
  const importables = profile.importables ?? [];
  const functions = fileFunctions(text, profile);
  const known = new Set<string>([
    ...profile.keywords,
    ...profile.globals.map(matchKey),
    ...importables.map(matchKey),
    ...functions.map(matchKey),
  ]);
  const declared: CompletionItem[] = fileIdentifiers(text, ctx)
    .filter((name) => !known.has(name))
    .map((name) => ({ label: name, insertText: name, kind: "variable" }));
  // A template is offered only where Tab would expand it: never `psvm` inside a method body.
  const templates: CompletionItem[] = profile.templates
    .filter((template) => templateFits(text, ctx.replaceFrom, ctx.replaceTo, template, profile))
    .map((template) => ({
    label: template.abbreviation,
    insertText: template.body,
    kind: "snippet",
    detail: template.description,
  }));
  return dedupe([...declared, ...functions, ...keywords, ...profile.globals, ...importables, ...templates]);
}

/** Inside an import statement: only the names that statement can import. */
function importCandidates(ctx: CompletionContext, profile: LanguageProfile): Candidate[] {
  const qualifier = ctx.qualifier ?? "";
  const items = profile.importTargets?.[qualifier] ?? profile.members[qualifier] ?? [];
  return dedupe(items).map((item) => ({ item, group: 0 }));
}

/** After "#include <": the headers whose path starts with what is typed, any case. */
function includeCandidates(ctx: CompletionContext, profile: LanguageProfile, limit: number): CompletionItem[] {
  const typed = ctx.prefix.toLowerCase();
  const headers = profile.importTargets?.["#include"] ?? [];
  return headers.filter((item) => item.label.toLowerCase().startsWith(typed)).slice(0, Math.max(0, limit));
}

/**
 * The qualifier's own members, then the members offered after any qualifier. A general member
 * the qualifier already names (print after System.out) is dropped: the specific one is the truth.
 */
function memberCandidates(ctx: CompletionContext, text: string, profile: LanguageProfile): Candidate[] {
  const qualifier = ctx.qualifier ?? "";
  // A variable whose type the text states (`List<Integer> xs`, `vector<int> v`, `s = ""`) gets
  // that type's members, and only those, ahead of anything the file names after a dot.
  const inferred =
    profile.members[qualifier] === undefined ? inferType(text, qualifier, ctx.replaceFrom, profile.id) : null;
  const typed = inferred === null ? undefined : profile.typeMembers?.[inferred];
  const specific = dedupe(qualifier === "*" ? [] : (typed ?? profile.members[qualifier] ?? []));
  const named = new Set(specific.map(matchKey));
  const general =
    typed !== undefined ? [] : dedupe(profile.members["*"] ?? []).filter((item) => !named.has(matchKey(item)));
  const library = new Set([...named, ...general.map(matchKey)]);
  // The file's own members (`self.val`, a Node's `next`). A call the library already lists keeps
  // the library's row, which knows its parameters; a field always gets its own row, since
  // `node.next` and Scanner's `next()` are different things that share a name.
  const chainStartsAt = ctx.replaceFrom - qualifier.length - 2;
  // A library type the text names (an inferred List, vector or str) has no members of the file's.
  const ownMembers = typed !== undefined ? [] : fileMembers(text, profile.lineComment === "//", chainStartsAt, ctx.replaceFrom);
  const own: CompletionItem[] = ownMembers
    .filter((member) => !(member.isMethod && library.has(member.name)))
    .filter((member) => !named.has(member.name))
    .map((member) =>
      member.isMethod
        ? { label: `${member.name}()`, insertText: `${member.name}()`, kind: "method", caretOffset: member.name.length + 1 }
        : { label: member.name, insertText: member.name, kind: "field" },
    );
  return [
    ...specific.map((item) => ({ item, group: 0 })),
    ...own.map((item) => ({ item, group: 1 })),
    ...general.map((item) => ({ item, group: 2 })),
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
  if (ctx.scope === "include") return includeCandidates(ctx, profile, limit);
  const candidates =
    ctx.scope === "import"
      ? importCandidates(ctx, profile)
      : ctx.qualifier === null
        ? topLevelCandidates(ctx, text, profile).map((item) => ({ item, group: 0 }))
        : memberCandidates(ctx, text, profile);
  return rank(ctx.prefix, candidates, limit);
}

/**
 * Java words IntelliJ never completes in contest code: `const` and `goto` are reserved and unused,
 * and `yield` is only a keyword inside a switch expression, so `x = y` + Enter must not become
 * `x = yield`.
 */
const NEVER_OFFERED_JAVA: ReadonlySet<string> = new Set(["const", "goto", "yield"]);

/** Type names written in lower case in front of a variable name. */
const LOWERCASE_TYPES: ReadonlySet<string> = new Set([
  "int", "long", "double", "float", "char", "boolean", "bool", "short", "byte", "var", "auto",
  "void", "unsigned", "signed", "string", "size_t", "ll", "ull", "ld",
]);

/** `int`, `Scanner`, `List<Integer>`, `int[]`, `Node*` right before the word being typed. */
const DECLARED_TYPE = /(?:^|[\s(,;{])([A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*)(<[^;=(){}]*>)?((?:\s*\[\s*\])*)([*&]*)\s+[*&]*$/;

/**
 * Whether the word being typed names a new variable (`int n|`, `Scanner sc|`, `vector<int> v|`).
 * IntelliJ and CLion offer no keyword or template there, so the popup stays shut and Enter stays a
 * newline: `int n` + Enter used to become `int new`, and `Scanner sc` + Enter the scanner template.
 */
export function inDeclarationName(text: string, ctx: CompletionContext, profile: LanguageProfile): boolean {
  if (profile.id === "python" || ctx.qualifier !== null || ctx.scope !== undefined) return false;
  const lineStart = text.lastIndexOf("\n", ctx.replaceFrom - 1) + 1;
  const match = DECLARED_TYPE.exec(text.slice(lineStart, ctx.replaceFrom));
  if (match === null) return false;
  const name = match[1] ?? "";
  if ((match[2] ?? "") !== "" || (match[3] ?? "") !== "" || (match[4] ?? "") !== "") return true;
  const last = name.split(/\.|::/).pop() ?? "";
  return LOWERCASE_TYPES.has(name) || /^[A-Z]/.test(last);
}

/**
 * Whether accepting `item` would only add what follows a name the student has typed in full
 * (`readline` to `readline()`). Enter is then a newline: the popup must never eat one.
 */
export function typedInFull(ctx: CompletionContext, item: CompletionItem): boolean {
  return ctx.prefix !== "" && matchKey(item) === ctx.prefix;
}

/** Kinds a "(" typed with the popup open completes: the call it starts. */
const CALLABLE_KINDS: ReadonlySet<string> = new Set(["method", "function"]);
/** Kinds a "." typed with the popup open completes: the thing it qualifies. */
const QUALIFIABLE_KINDS: ReadonlySet<string> = new Set(["type", "variable", "field"]);

/**
 * Whether typing `ch` with the popup open first accepts `item`, as IntelliJ's lookup does for
 * `printl(` (println) and `Sys.` (System). Only for a real prefix of the item's name, never for a
 * name the file already has spelled exactly as typed (`sc.` stays `sc.`), and never a template.
 */
export function acceptsOnCharacter(
  ch: string,
  ctx: CompletionContext,
  items: readonly CompletionItem[],
  item: CompletionItem,
): boolean {
  if (ctx.prefix.length < 2 || ctx.scope !== undefined) return false;
  if (items.some((candidate) => matchKey(candidate) === ctx.prefix)) return false;
  if (!matchKey(item).startsWith(ctx.prefix)) return false;
  if (ch === "(") return CALLABLE_KINDS.has(item.kind) || (item.kind === "type" && item.insertText.endsWith(")"));
  if (ch === ".") return QUALIFIABLE_KINDS.has(item.kind) && !item.insertText.includes("(");
  return false;
}

/** Kinds whose accept, when the name is typed in full, would add nothing a student wants. */
const SETTLED_KINDS: ReadonlySet<string> = new Set(["keyword", "variable", "field", "type"]);

/**
 * Whether the popup should stay closed while typing, so Enter and Tab keep their plain meaning:
 * the top row is a name already typed in full (`return`, `n`, `String`), or every row is a word
 * from the file spelled exactly as typed. A call typed in full (`max`) still opens, since
 * accepting it adds the parentheses. An explicit Ctrl+Space ignores this.
 */
export function autoPopupSuppressed(ctx: CompletionContext, items: readonly CompletionItem[]): boolean {
  const top = items[0];
  if (top === undefined) return true;
  if (matchKey(top) === ctx.prefix && SETTLED_KINDS.has(top.kind)) return true;
  return items.every((item) => item.kind === "variable" && item.label === ctx.prefix);
}

/**
 * Whether an explicit Ctrl+Space inserts its one suggestion without showing a list, as IntelliJ's
 * "Insert single suggestion automatically" does. Only ever asked for an explicit invocation.
 */
export function insertsSingleSuggestion(items: readonly CompletionItem[]): boolean {
  return items.length === 1;
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
 * indent, and the caret goes where $END$ was (or the first field), or at the end when there is none.
 */
export function expandTemplateBody(
  body: string,
  indent: string,
): { readonly text: string; readonly caret: number } {
  // A tab "unit" leaves leading tabs as they are written.
  const rendered = renderTemplate(body, indent, "\t");
  return { text: rendered.text, caret: rendered.selectionStart };
}

/** The indent unit a template inserted from the popup widens tabs to, when the caller names none. */
const DEFAULT_INDENT_UNIT = "    ";

/**
 * The one replacement that accepting `item` in `ctx` performs. A template keeps its fields, so
 * Tab after accepting `fori` from the list moves on exactly as it does after `fori` + Tab.
 */
export function applyCompletion(
  state: EditState,
  ctx: CompletionContext,
  item: CompletionItem,
  indentOrProfile: string | LanguageProfile = DEFAULT_INDENT_UNIT,
): Edit {
  // Passing the profile (rather than only its indent unit) turns on what depends on the language:
  // the import an accepted class needs, and `new ArrayList<>()` after `new `.
  const profile = typeof indentOrProfile === "string" ? undefined : indentOrProfile;
  const indentUnit = typeof indentOrProfile === "string" ? indentOrProfile : indentOrProfile.indentUnit;
  if (item.kind === "snippet") {
    const indent = indentAt(state.text, ctx.replaceFrom);
    const template = profile?.templates.find((candidate) => candidate.abbreviation === item.label);
    const body =
      resolveMacros(item.insertText, state.text, ctx.replaceFrom) ??
      (template?.fallback === undefined ? null : resolveMacros(template.fallback, state.text, ctx.replaceFrom)) ??
      item.insertText;
    const rendered = renderTemplate(body, indent, indent.includes("\t") ? "\t" : indentUnit);
    const edit: Edit = {
      from: ctx.replaceFrom,
      to: ctx.replaceTo,
      insert: rendered.text,
      selectionStart: ctx.replaceFrom + rendered.selectionStart,
      selectionEnd: ctx.replaceFrom + rendered.selectionEnd,
    };
    return { ...edit, ...templateParts(rendered, ctx.replaceFrom) };
  }
  const { insertText, caretOffset } = shapedInsert(state.text, ctx, item, profile);
  const offset = caretOffset ?? insertText.length;
  const clamped = Math.min(Math.max(offset, 0), insertText.length);
  const caret = ctx.replaceFrom + clamped;
  const edit: Edit = {
    from: ctx.replaceFrom,
    to: ctx.replaceTo,
    insert: insertText,
    selectionStart: caret,
    selectionEnd: caret,
  };
  if (profile === undefined || ctx.scope !== undefined) return edit;
  return withImport(state.text, edit, item.importLine, profile);
}

/**
 * The text an accept inserts in its context: IntelliJ's `new ArrayList<>()` with the caret in the
 * parentheses after `new `, and a header's closing ">" after "#include <" when none follows.
 */
function shapedInsert(
  text: string,
  ctx: CompletionContext,
  item: CompletionItem,
  profile: LanguageProfile | undefined,
): { readonly insertText: string; readonly caretOffset: number | undefined } {
  if (ctx.scope === "include") {
    const closed = text.charAt(ctx.replaceTo) === ">";
    return { insertText: closed ? item.insertText : `${item.insertText}>`, caretOffset: undefined };
  }
  const isConstructor =
    profile?.id === "java" &&
    item.kind === "type" &&
    ctx.qualifier === null &&
    AFTER_NEW.test(textBefore(text, ctx.replaceFrom)) &&
    text.charAt(ctx.replaceTo) !== "(";
  if (isConstructor) {
    const head = `${item.insertText}${item.generic === true ? "<>" : ""}(`;
    return { insertText: `${head})`, caretOffset: head.length };
  }
  return { insertText: item.insertText, caretOffset: item.caretOffset };
}
