import type { CompletionItem, EditState, LanguageProfile } from "./types";

/**
 * Quick Documentation (F1, Cmd+J, Ctrl+Q): what the name at the caret is, from the profile's own
 * completion data.
 *
 * Minimal version written by the commands group against the agreed name `docFor`; the completion
 * group's version, with written sentences per item, replaces it.
 */

export interface QuickDoc {
  /** The signature or name, e.g. "nextInt()". */
  readonly title: string;
  /** One or two sentences, or the item's detail when no sentence is written yet. */
  readonly body: string;
}

/** An item that may carry a written sentence, which the completion group adds as `doc`. */
type DocumentedItem = CompletionItem & { readonly doc?: string };

function nameOf(item: CompletionItem): string {
  return /^[A-Za-z_$][\w$]*/.exec(item.insertText)?.[0] ?? item.insertText;
}

function describe(item: DocumentedItem): QuickDoc {
  const body = item.doc ?? (item.detail === undefined ? item.kind : `${item.kind}, ${item.detail}`);
  return { title: item.label, body };
}

/** The doc for `item` when one is highlighted in the popup, else for the name at the caret. */
export function docFor(state: EditState, profile: LanguageProfile, item?: CompletionItem): QuickDoc | null {
  if (item !== undefined) return describe(item);
  const { text, selectionStart: caret } = state;
  let start = caret;
  let end = caret;
  while (start > 0 && /[\w$]/.test(text[start - 1] ?? "")) start -= 1;
  while (end < text.length && /[\w$]/.test(text[end] ?? "")) end += 1;
  if (start === end) return null;
  const name = text.slice(start, end);

  const qualifier = /([A-Za-z_$][\w$.]*?)\s*(?:\.|::|->)\s*$/.exec(text.slice(0, start))?.[1] ?? null;
  const pools: (readonly CompletionItem[])[] =
    qualifier === null ? [profile.globals] : [profile.members[qualifier] ?? [], profile.members["*"] ?? [], profile.globals];
  const found = pools.flat().find((candidate) => nameOf(candidate) === name);
  if (found !== undefined) return describe(found);
  if (profile.keywords.includes(name)) return { title: name, body: "keyword" };
  return null;
}
