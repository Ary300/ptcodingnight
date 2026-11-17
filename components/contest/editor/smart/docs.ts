/**
 * Parameter Info (Mod+P) and Quick Documentation (F1, or Ctrl+Q off a Mac) as data.
 *
 * Both read the same completion tables the popup uses, so a signature never disagrees with the row
 * that inserted the call. Each entry is a signature and one plain sentence. The surface renders
 * them; nothing here touches the DOM.
 */

import { completionContext } from "./completion";
import { inferType } from "./infer";
import type { CompletionItem, LanguageProfile } from "./types";

/** Signatures the tables do not spell out: builtins whose rows insert a bare "name()". */
const EXTRA: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  python: {
    print: ["print(*values, sep=' ', end='\\n'). Writes the values separated by sep, then end."],
    input: ["input(prompt=''). Reads one line from standard input, without the line break."],
    len: ["len(obj). The number of items."],
    range: ["range(stop). 0 up to, not including, stop.", "range(start, stop, step=1). start up to, not including, stop."],
    sorted: ["sorted(iterable, key=None, reverse=False). A new sorted list."],
    sum: ["sum(iterable, start=0). The total."],
    max: ["max(iterable, key=None). The largest item.", "max(a, b, *rest). The largest argument."],
    min: ["min(iterable, key=None). The smallest item.", "min(a, b, *rest). The smallest argument."],
    abs: ["abs(x). The absolute value."],
    enumerate: ["enumerate(iterable, start=0). Pairs of (index, item)."],
    zip: ["zip(*iterables). Tuples of items taken side by side."],
    map: ["map(function, iterable). function applied to each item, as in map(int, input().split())."],
    round: ["round(number, ndigits=None). Rounded to ndigits, half to even."],
    divmod: ["divmod(a, b). The pair (a // b, a % b)."],
    "math.sqrt": ["sqrt(x). The square root, as a float."],
    "math.gcd": ["gcd(*integers). The greatest common divisor."],
    "math.ceil": ["ceil(x). The smallest integer not below x."],
    "math.floor": ["floor(x). The largest integer not above x."],
  },
  cpp: {
    sort: ["void sort(RandomIt first, RandomIt last). Sorts the range ascending.", "void sort(RandomIt first, RandomIt last, Compare comp). Sorts with comp."],
    max: ["const T& max(const T& a, const T& b). The larger value. Both must have the same type."],
    min: ["const T& min(const T& a, const T& b). The smaller value. Both must have the same type."],
    swap: ["void swap(T& a, T& b). Exchanges the two values."],
    reverse: ["void reverse(BidirIt first, BidirIt last). Reverses the range in place."],
    accumulate: ["T accumulate(InputIt first, InputIt last, T init). init plus every element. Use 0LL for a long long total."],
    lower_bound: ["ForwardIt lower_bound(ForwardIt first, ForwardIt last, const T& value). The first element not less than value."],
    upper_bound: ["ForwardIt upper_bound(ForwardIt first, ForwardIt last, const T& value). The first element greater than value."],
    getline: ["istream& getline(istream& in, string& str). Reads one line into str."],
    to_string: ["string to_string(int value). The number as text."],
    stoi: ["int stoi(const string& str). The text as an int."],
    printf: ["int printf(const char* format, ...). Writes formatted output: %d int, %lld long long, %s string."],
    scanf: ["int scanf(const char* format, ...). Reads formatted input into the addresses given."],
    make_pair: ["pair<T1, T2> make_pair(T1 a, T2 b). A pair of the two values."],
  },
  java: {
    "Math.max": ["int max(int a, int b)", "long max(long a, long b)", "double max(double a, double b)"],
    "Math.min": ["int min(int a, int b)", "long min(long a, long b)", "double min(double a, double b)"],
    "Math.abs": ["int abs(int a)", "long abs(long a)", "double abs(double a)"],
    "System.out.println": ["void println()", "void println(String x)", "void println(int x)", "void println(Object x)"],
  },
};

const LEADING_NAME = /^[A-Za-z0-9_$]+/;
const nameOf = (item: CompletionItem): string => LEADING_NAME.exec(item.label)?.[0] ?? item.label;

/** "int max(int a, int b)" from a Java row, or the signature part of a row's doc. */
function signatureOf(item: CompletionItem): string | null {
  if (item.doc !== undefined) {
    const head = /^(.*?\))\.\s/.exec(item.doc);
    if (head?.[1] !== undefined) return head[1];
  }
  if (/\(.+\)/.test(item.label)) return item.detail === undefined ? item.label : `${item.detail} ${item.label}`;
  return null;
}

/** The rows that could be the call `qualifier.name`, best source first. */
function rowsFor(qualifier: string | null, name: string, profile: LanguageProfile, text: string, at: number): CompletionItem[] {
  const sources: (readonly CompletionItem[] | undefined)[] = [];
  if (qualifier === null) {
    sources.push(profile.globals, profile.importables);
  } else {
    const inferred = profile.members[qualifier] === undefined ? inferType(text, qualifier, at, profile.id) : null;
    if (inferred !== null) sources.push(profile.typeMembers?.[inferred]);
    sources.push(profile.members[qualifier], profile.members["*"]);
  }
  return sources.flatMap((source) => (source ?? []).filter((item) => nameOf(item) === name));
}

function extraFor(qualifier: string | null, name: string, profile: LanguageProfile): readonly string[] {
  const table = EXTRA[profile.id] ?? {};
  return table[qualifier === null ? name : `${qualifier}.${name}`] ?? (qualifier === null ? [] : (table[name] ?? []));
}

/**
 * Parameter Info: the known signatures of `qualifier.name` (qualifier null for a bare call). The
 * `text` and `at` let a variable's declared type pick its own members (`xs.add` on a List).
 */
export function signaturesFor(
  qualifier: string | null,
  name: string,
  profile: LanguageProfile,
  text = "",
  at = text.length,
): readonly string[] {
  const extra = extraFor(qualifier, name, profile).map((entry) => entry.split(". ")[0] ?? entry);
  const fromRows = rowsFor(qualifier, name, profile, text, at)
    .map(signatureOf)
    .filter((signature): signature is string => signature !== null);
  return [...new Set([...extra, ...fromRows])];
}

export interface SignatureHelp {
  readonly name: string;
  readonly signatures: readonly string[];
  /** Which argument the caret is in, counted by top-level commas from 0. */
  readonly activeParameter: number;
}

/** The call whose parentheses hold `caret`: the "(" offset, and how many top-level commas precede. */
function enclosingCall(text: string, caret: number): { readonly open: number; readonly commas: number } | null {
  let depth = 0;
  let commas = 0;
  for (let i = caret - 1; i >= 0; i -= 1) {
    const ch = text.charAt(i);
    if (ch === ")" || ch === "]" || ch === "}") depth += 1;
    else if (ch === "(" || ch === "[" || ch === "{") {
      if (depth === 0) return ch === "(" ? { open: i, commas } : null;
      depth -= 1;
    } else if (ch === "," && depth === 0) commas += 1;
    else if (ch === ";" && depth === 0) return null;
  }
  return null;
}

/** Parameter Info at the caret, or null when the caret is not inside a known call's parentheses. */
export function signatureAt(text: string, caret: number, profile: LanguageProfile): SignatureHelp | null {
  const call = enclosingCall(text, caret);
  if (call === null) return null;
  const ctx = completionContext(text, call.open, profile.lineComment);
  if (ctx === null || ctx.prefix === "") return null;
  const signatures = signaturesFor(ctx.qualifier, ctx.prefix, profile, text, ctx.replaceFrom);
  if (signatures.length === 0) return null;
  return { name: ctx.prefix, signatures, activeParameter: call.commas };
}

/** Quick Documentation for `qualifier.name`: a signature and one sentence, or null. */
export function docFor(
  qualifier: string | null,
  name: string,
  profile: LanguageProfile,
  text = "",
  at = text.length,
): string | null {
  const row = rowsFor(qualifier, name, profile, text, at).find((item) => item.doc !== undefined);
  if (row?.doc !== undefined) return row.doc;
  const extra = extraFor(qualifier, name, profile)[0];
  if (extra !== undefined) return extra;
  const plain = rowsFor(qualifier, name, profile, text, at)[0];
  return plain === undefined ? null : (signatureOf(plain) ?? (plain.detail === undefined ? plain.label : `${plain.label}: ${plain.detail}`));
}

/** Quick Documentation for the name under the caret. */
export function quickDocAt(text: string, caret: number, profile: LanguageProfile): string | null {
  let end = caret;
  while (end < text.length && /[A-Za-z0-9_$]/.test(text.charAt(end))) end += 1;
  const ctx = completionContext(text, end, profile.lineComment);
  if (ctx === null || ctx.prefix === "") return null;
  return docFor(ctx.qualifier, ctx.prefix, profile, text, ctx.replaceFrom);
}
