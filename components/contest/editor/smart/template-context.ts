/**
 * Where a live template may expand, as IntelliJ's template contexts decide it.
 *
 * Without this, Tab after any word that happens to be an abbreviation expanded it: a variable
 * named `vi`, `vector<ll` becoming `vector<long long ;`, `sout` inside a string. A template now
 * fires only in code (never in a string or comment), never in the middle of an identifier, and
 * only where its kind of code belongs.
 */

import { regionAt, scanCode } from "./scan";
import { BRACE_LANGUAGES, isWordChar, lineEndAt, lineStartAt } from "./text";
import type { LanguageProfile, LiveTemplate, TemplateContext } from "./types";

const MARKERS = /\$END\$|\$\{\d+(?::[^}\n]*)?\}/g;

/** The context a template declares, or the one its body implies. */
export function contextOf(template: LiveTemplate): TemplateContext {
  if (template.context !== undefined) return template.context;
  const body = template.body.replace(MARKERS, "").trim();
  if (body.includes("__name__") || /^int\s+main\s*\(/.test(body) || body.startsWith("#")) return "toplevel";
  if (/\bstatic\s+void\s+main\s*\(/.test(body)) return "classbody";
  if (body.includes("\n") || body.endsWith(";") || body.endsWith("}") || body.endsWith(":")) return "statement";
  if (/^(?:throw|return|if|for|while)\b/.test(body)) return "statement";
  return "declaration";
}

/** After these, a statement may start on the same line: `if (x) sout`, `else sout`, `{ sout`. */
const BRACE_STATEMENT_START = /(?:^|[;{}]|\)|\belse)\s*$/;
/** Python: the start of a line, or the body after a header's ":". */
const PYTHON_STATEMENT_START = /(?:^|:)\s*$/;
/** A declaration template also fits after a space, "(", "<" or ",". */
const DECLARATION_START = /(?:^|[\s(<,])$/;
/** Only closers and whitespace may follow a statement template on its line. */
const ONLY_CLOSERS_AFTER = /^[\s)\]};]*$/;

function braceDepthAt(text: string, pos: number, profile: LanguageProfile): number {
  let depth = 0;
  scanCode(text, pos, profile, (ch) => {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  });
  return depth;
}

/**
 * Whether the template whose abbreviation spans [wordStart, caret) may expand there. The
 * abbreviation must be a whole word in code, and its context must match the line around it.
 */
export function templateFits(
  text: string,
  wordStart: number,
  caret: number,
  template: LiveTemplate,
  profile: LanguageProfile,
): boolean {
  if (isWordChar(text[caret]) || isWordChar(text[wordStart - 1])) return false;
  if (regionAt(text, wordStart, profile) !== "code") return false;

  const lineStart = lineStartAt(text, wordStart);
  const before = text.slice(lineStart, wordStart);
  const after = text.slice(caret, lineEndAt(text, caret));
  const braces = BRACE_LANGUAGES.has(profile.id);
  const statementStart = braces ? BRACE_STATEMENT_START : PYTHON_STATEMENT_START;

  switch (contextOf(template)) {
    case "declaration":
      return DECLARATION_START.test(before);
    case "statement":
      return statementStart.test(before) && ONLY_CLOSERS_AFTER.test(after);
    case "classbody":
      return before.trim() === "" && ONLY_CLOSERS_AFTER.test(after) && braceDepthAt(text, lineStart, profile) <= 1;
    case "toplevel":
      if (!braces) return before === "" && after.trim() === "";
      return before.trim() === "" && after.trim() === "" && braceDepthAt(text, lineStart, profile) === 0;
  }
}
