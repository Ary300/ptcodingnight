/**
 * A live template still being filled in, and where Tab or Enter goes next.
 *
 * IntelliJ keeps a template "active" after it expands: the caret sits in the first field, Tab
 * moves to the next, and the last Tab lands on $END$ (the indented line inside a loop's braces).
 * The editor only ever edits inside the CURRENT field while a template is active, so a stop
 * before the field never moves and a stop after it moves by exactly the change in the text's
 * length. That is all the bookkeeping this needs, and it keeps the session a plain value.
 *
 * The session ends on its own the moment the caret is found outside the current field: a click
 * elsewhere, an arrow off the line, or a field typed past its own end.
 */

import type { Edit, EditState, TabStop } from "./types";

export interface TemplateSession {
  /** Length of the text when the session last moved, to measure the field's growth against. */
  readonly textLength: number;
  /** The field the caret is in, as it was when the session last moved. */
  readonly field: TabStop;
  /** The stops still to visit, in order. Never empty: an exhausted session is null. */
  readonly stops: readonly TabStop[];
}

/** The session an applied edit starts, or null when the edit was not a template with fields. */
export function startTemplateSession(textAfter: string, edit: Edit): TemplateSession | null {
  const stops = edit.tabStops ?? [];
  if (stops.length === 0) return null;
  const field: TabStop =
    edit.mirrors === undefined || edit.mirrors.length === 0
      ? { from: edit.selectionStart, to: edit.selectionEnd }
      : { from: edit.selectionStart, to: edit.selectionEnd, mirrors: edit.mirrors };
  return { textLength: textAfter.length, field, stops };
}

/**
 * The move to the next stop, and the session after it (null once $END$ is reached). Null when
 * the caret has left the current field, which means the session is over and the key is not ours.
 * A field with copies writes what was typed into each of them on the way out, in the same edit,
 * so the move is still one undo step.
 */
export function nextTemplateStop(
  session: TemplateSession,
  state: EditState,
): { readonly edit: Edit; readonly session: TemplateSession | null } | null {
  const delta = state.text.length - session.textLength;
  const fieldEnd = session.field.to + delta;
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  if (fieldEnd < session.field.from || start < session.field.from || end > fieldEnd) return null;

  // Everything after the field moved by what was typed in it.
  const afterTyping = (pos: number): number => (pos >= session.field.to ? pos + delta : pos);
  const typed = state.text.slice(session.field.from, fieldEnd);
  const mirrors = (session.field.mirrors ?? []).map((mirror) => ({ from: afterTyping(mirror.from), to: afterTyping(mirror.to) }));
  const stale = mirrors.filter((mirror) => state.text.slice(mirror.from, mirror.to) !== typed);
  // Then by what each mirror grew, for everything after that mirror.
  const grown = (pos: number): number =>
    pos + stale.filter((mirror) => mirror.to <= pos).reduce((sum, mirror) => sum + typed.length - (mirror.to - mirror.from), 0);
  const place = (stop: TabStop): TabStop => {
    const from = grown(afterTyping(stop.from));
    const to = grown(afterTyping(stop.to));
    return stop.mirrors === undefined ? { from, to } : { from, to, mirrors: stop.mirrors.map(place) };
  };

  const moved = session.stops.map(place);
  const [next, ...rest] = moved;
  const growth = grown(state.text.length) - state.text.length;
  if (next === undefined || next.to > state.text.length + growth) return null;

  const first = stale[0];
  const last = stale[stale.length - 1];
  let edit: Edit;
  if (first === undefined || last === undefined) {
    edit = { from: start, to: start, insert: "", selectionStart: next.from, selectionEnd: next.to };
  } else {
    let insert = "";
    let cursor = first.from;
    for (const mirror of stale) {
      insert += state.text.slice(cursor, mirror.from) + typed;
      cursor = mirror.to;
    }
    edit = { from: first.from, to: last.to, insert, selectionStart: next.from, selectionEnd: next.to };
  }
  const after = rest.length === 0 ? null : { textLength: state.text.length + growth, field: next, stops: rest };
  return { edit, session: after };
}
