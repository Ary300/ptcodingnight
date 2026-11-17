/**
 * IntelliJ's Insert Live Template (Cmd+J on a Mac, Ctrl+J elsewhere), as pure functions.
 *
 * The list holds this language's templates that fit where the caret is, with their descriptions.
 * When the caret ends a word that begins some template abbreviations, the list narrows to those
 * and choosing one replaces the word, as IntelliJ's popup filters by what was already typed.
 * Choosing inserts the template with its fields, through the same renderer Tab uses, so Tab and
 * Enter walk the fields exactly as after `fori` + Tab.
 */

import { renderTemplate, templateParts } from "./template";
import { templateFits } from "./template-context";
import { resolveMacros } from "./template-macros";
import type { Edit, EditState, LanguageProfile, LiveTemplate } from "./types";

const TRAILING_WORD = /[A-Za-z0-9_$]+$/;

export interface TemplateChoices {
  /** Where the inserted template starts: the start of the typed prefix, or the caret. */
  readonly from: number;
  readonly to: number;
  readonly templates: readonly LiveTemplate[];
}

function lineStartAt(text: string, at: number): number {
  return text.lastIndexOf("\n", at - 1) + 1;
}

/** The templates the popup lists at this caret, and the range a choice replaces. */
export function templateChoices(state: EditState, profile: LanguageProfile): TemplateChoices {
  const { text, selectionStart: start, selectionEnd: end } = state;
  const fitting = (from: number, to: number) =>
    profile.templates.filter((template) => templateFits(text, from, to, template, profile));
  if (start !== end) return { from: start, to: end, templates: fitting(start, start) };

  const word = TRAILING_WORD.exec(text.slice(lineStartAt(text, start), start))?.[0] ?? "";
  if (word !== "") {
    const from = start - word.length;
    const prefixed = fitting(from, start).filter((template) => template.abbreviation.startsWith(word));
    if (prefixed.length > 0) return { from, to: start, templates: prefixed };
  }
  return { from: start, to: start, templates: fitting(start, start) };
}

/** The edit choosing `template` performs: the body at the line's indent, caret on its first field. */
export function insertTemplateEdit(
  text: string,
  choices: Pick<TemplateChoices, "from" | "to">,
  template: LiveTemplate,
  profile: LanguageProfile,
): Edit {
  const { from, to } = choices;
  const indent = /^[ \t]*/.exec(text.slice(lineStartAt(text, from)))?.[0] ?? "";
  const body =
    resolveMacros(template.body, text, from) ??
    resolveMacros(template.fallback ?? template.body, text, from) ??
    template.body;
  const unit = indent.includes("\t") ? "\t" : profile.indentUnit;
  const rendered = renderTemplate(body, indent, unit);
  const edit: Edit = {
    from,
    to,
    insert: rendered.text,
    selectionStart: from + rendered.selectionStart,
    selectionEnd: from + rendered.selectionEnd,
  };
  return { ...edit, ...templateParts(rendered, from) };
}
