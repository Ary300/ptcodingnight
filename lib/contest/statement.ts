/**
 * Presentation rules for an authored problem statement.
 *
 * Pure string work, in `lib/` rather than beside the component, because that is where this
 * project keeps functions with no I/O — and because it is where the unit suite looks.
 */

/**
 * Drop a leading `# Title` from a statement when it only repeats the title the page already
 * shows.
 *
 * Statements are authored as standalone markdown documents, so opening with the problem's name
 * is the right thing for the file and the wrong thing once it is rendered under a page heading
 * that says the same words. The result was the title twice, six lines apart, plus a second `h1`
 * on the page — which axe does not flag but which makes the document outline claim there are two
 * documents here.
 *
 * Matched against the title rather than stripped unconditionally: a statement that opens with a
 * genuinely different heading is saying something, and it keeps it.
 */
export function statementWithoutRepeatedTitle(statementMd: string, title: string): string {
  const trimmed = statementMd.replace(/^\s+/, "");
  const [firstLine, ...rest] = trimmed.split("\n");
  if (firstLine === undefined || !firstLine.startsWith("# ")) return statementMd;
  if (firstLine.slice(2).trim().toLowerCase() !== title.trim().toLowerCase()) return statementMd;
  return rest.join("\n").replace(/^\s+/, "");
}
