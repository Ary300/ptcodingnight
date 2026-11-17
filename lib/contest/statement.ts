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

const FENCE_LINE = /^\s*(```|~~~)/;
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;

/** "Constraints", "**Constraints:**", "Constraints ##". Case-insensitive, nothing else. */
function isConstraintsHeading(text: string): boolean {
  const words = text
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`]/g, "")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();
  return words === "constraints";
}

/**
 * Drop every `Constraints` section from a statement shown to a student: the heading and
 * everything under it, up to the next heading of the same or higher rank, or the end.
 *
 * The organizers asked for the student page to be as plain as possible, and the constraints were
 * the section students read least and asked about most. The content files and the organizer's
 * editor keep them; this only changes what a student is shown.
 *
 * Fence-aware, because a `#` line inside a code block is sample data and not a heading: a
 * statement whose example prints `######` must not have its section boundary found there.
 */
export function statementWithoutConstraints(statementMd: string): string {
  return withoutSections(statementMd, isConstraintsHeading);
}

/**
 * Drop every section whose heading text `matches`: the heading and everything under it, up to the
 * next heading of the same or higher rank, or the end. Fence-aware. Only the cut points are tidied.
 */
function withoutSections(statementMd: string, matches: (text: string) => boolean): string {
  const lines = statementMd.split("\n");
  const kept: string[] = [];
  let inFence = false;
  let droppingAtLevel: number | null = null;
  let dropped = false;

  for (const line of lines) {
    const heading = inFence ? null : HEADING_LINE.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "").length;
      if (droppingAtLevel !== null && level <= droppingAtLevel) {
        droppingAtLevel = null;
        // One blank line between what came before the cut and the heading after it.
        if (kept.length > 0) kept.push("");
      }
      if (droppingAtLevel === null && matches(heading[2] ?? "")) {
        droppingAtLevel = level;
        dropped = true;
        // The blank lines that separated the previous section from the dropped one.
        while (kept.length > 0 && (kept[kept.length - 1] ?? "").trim() === "") kept.pop();
      }
    }
    if (FENCE_LINE.test(line)) inFence = !inFence;
    if (droppingAtLevel === null) kept.push(line);
  }

  if (!dropped) return statementMd;
  const body = kept.join("\n");
  // Only the cut points were tidied; blank lines inside the sections that remain, including
  // inside sample data, are left exactly as the author wrote them.
  return statementMd.endsWith("\n") && !body.endsWith("\n") ? `${body}\n` : body;
}

/* ---- Examples: the statement's worked examples, folded into the published samples ---- */

/** "Example", "Examples", "**Examples:**". The section that holds the worked examples. */
function isExamplesHeading(text: string): boolean {
  const words = text
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`]/g, "")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();
  return words === "example" || words === "examples";
}

/** `**Example 2**` on its own line. */
const EXAMPLE_MARKER = /^\s*(?:\*\*|__)\s*examples?\s*\d*\s*:?\s*(?:\*\*|__)\s*:?\s*$/i;
/** A deeper `### Example 2` heading inside the section. */
const EXAMPLE_SUBHEADING = /^examples?\s*\d*\s*:?$/i;

/**
 * A line that only names the block under it: "Input:", "**Output**", "Sample 2 input:". The
 * student view prints its own "Input" and "Expected output" headings, so these carry nothing.
 */
const IO_LABEL =
  /^\s*(?:\*\*|__)?\s*(?:(?:sample|example)\s*\d*\s*)?(?:input|output|expected output)\s*\d*\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i;

/** One worked example from a statement: what goes in, what comes out, and why. */
export interface StatementExample {
  readonly input: string;
  readonly output: string;
  /** The prose after the output block, as markdown. Empty when the author wrote none. */
  readonly explanation: string;
}

interface Section {
  /** Index of the heading line. */
  readonly start: number;
  /** One past the last line of the section. */
  readonly end: number;
  readonly level: number;
}

/** Every section whose heading matches, fence-aware, each ending at the next heading of its rank. */
function findSections(lines: readonly string[], matches: (text: string) => boolean): Section[] {
  const found: Section[] = [];
  let inFence = false;
  let openStart = -1;
  let openLevel = 0;
  lines.forEach((line, index) => {
    const heading = inFence ? null : HEADING_LINE.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "").length;
      if (openStart !== -1 && level <= openLevel) {
        found.push({ start: openStart, end: index, level: openLevel });
        openStart = -1;
      }
      if (openStart === -1 && matches(heading[2] ?? "")) {
        openStart = index;
        openLevel = level;
      }
    }
    if (FENCE_LINE.test(line)) inFence = !inFence;
  });
  if (openStart !== -1) found.push({ start: openStart, end: lines.length, level: openLevel });
  return found;
}

function trimBlankEdges(lines: readonly string[]): string {
  let from = 0;
  let to = lines.length;
  while (from < to && (lines[from] ?? "").trim() === "") from += 1;
  while (to > from && (lines[to - 1] ?? "").trim() === "") to -= 1;
  return lines.slice(from, to).join("\n");
}

interface Draft {
  readonly input: string | null;
  readonly output: string | null;
  readonly explanation: readonly string[];
}

const EMPTY_DRAFT: Draft = { input: null, output: null, explanation: [] };

function isExampleBoundary(line: string, level: number): boolean {
  if (EXAMPLE_MARKER.test(line)) return true;
  const heading = HEADING_LINE.exec(line);
  return (
    heading !== null &&
    (heading[1] ?? "").length > level &&
    EXAMPLE_SUBHEADING.test((heading[2] ?? "").replace(/[*_`]/g, "").trim())
  );
}

/**
 * Read one Example section's body as input/output pairs. Null as soon as anything in it does not
 * fit that shape: prose before an input, prose between an input and its output, an input with no
 * output, or an unclosed code block. Null means "show the section as the author wrote it", so a
 * reading that is unsure loses nothing.
 */
function readExampleBody(body: readonly string[], level: number): StatementExample[] | null {
  const done: StatementExample[] = [];
  let current: Draft = EMPTY_DRAFT;

  /** Close the example being read. False when it is half a pair. */
  const finish = (): boolean => {
    if (current.input === null && current.output === null) return true;
    if (current.input === null || current.output === null) return false;
    done.push({
      input: current.input,
      output: current.output,
      explanation: trimBlankEdges(current.explanation),
    });
    current = EMPTY_DRAFT;
    return true;
  };

  let index = 0;
  while (index < body.length) {
    const line = body[index] ?? "";
    if (FENCE_LINE.test(line)) {
      const close = body.findIndex((next, at) => at > index && FENCE_LINE.test(next));
      if (close === -1) return null;
      const content = body.slice(index + 1, close).join("\n");
      // A third block after a finished pair starts the next example, with no marker between.
      if (current.output !== null && !finish()) return null;
      current =
        current.input === null ? { ...current, input: content } : { ...current, output: content };
      index = close + 1;
      continue;
    }
    if (isExampleBoundary(line, level)) {
      if (!finish()) return null;
    } else if (current.output !== null) {
      // Labels are dropped; blank lines and prose belong to the explanation.
      if (!IO_LABEL.test(line)) current = { ...current, explanation: [...current.explanation, line] };
    } else if (line.trim() !== "" && !IO_LABEL.test(line)) {
      // Prose before an input, or between an input and its output: not a shape this reads.
      return null;
    }
    index += 1;
  }
  return finish() ? done : null;
}

/**
 * The worked examples in a statement's `Example` sections, or null when a section exists that
 * cannot be read as input and output blocks. An empty array means the statement has none.
 */
export function statementExamples(statementMd: string): readonly StatementExample[] | null {
  const lines = statementMd.split("\n");
  const examples: StatementExample[] = [];
  for (const section of findSections(lines, isExamplesHeading)) {
    const read = readExampleBody(lines.slice(section.start + 1, section.end), section.level);
    if (read === null || read.length === 0) return null;
    examples.push(...read);
  }
  return examples;
}

/**
 * Two texts the judge would call the same sample: line endings, trailing spaces on a line and
 * trailing newlines aside, which a markdown code block cannot carry anyway. Nothing else.
 */
export function sameSampleText(a: string, b: string): boolean {
  const norm = (text: string): string =>
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n+$/, "");
  return norm(a) === norm(b);
}

export interface PublishedSample {
  readonly ordinal: number;
  readonly input: string;
  readonly expectedOutput: string;
}

export interface ExamplesMerge {
  /** The statement with its Example sections removed, or unchanged when they were not merged. */
  readonly statementMd: string;
  /** Explanation markdown by sample ordinal, for the samples a statement example matched. */
  readonly explanations: Readonly<Record<number, string>>;
  /** True when the statement had examples and every one now lives in a sample. */
  readonly merged: boolean;
}

/**
 * Fold a statement's worked examples into the problem's published samples, so the student page
 * shows ONE Examples section that can also be run (the organizers found two redundant).
 *
 * Each statement example is matched to a sample by its input AND its output, never by position:
 * an author who reordered the tests, or wrote an example that is not a sample, must not have an
 * explanation printed under the wrong data. The statement's own section is removed only when
 * EVERY example in it matched a different sample. Anything less returns the statement untouched
 * and no explanations, so the student still reads every word the author wrote, exactly once.
 */
export function mergeStatementExamples(
  statementMd: string,
  samples: readonly PublishedSample[],
): ExamplesMerge {
  const unchanged: ExamplesMerge = { statementMd, explanations: {}, merged: false };
  const examples = statementExamples(statementMd);
  if (examples === null || examples.length === 0) return unchanged;

  const used = new Set<number>();
  const explanations: Record<number, string> = {};
  for (const example of examples) {
    const match = samples.find(
      (sample) =>
        !used.has(sample.ordinal) &&
        sameSampleText(sample.input, example.input) &&
        sameSampleText(sample.expectedOutput, example.output),
    );
    if (match === undefined) return unchanged;
    used.add(match.ordinal);
    if (example.explanation !== "") explanations[match.ordinal] = example.explanation;
  }

  return {
    statementMd: withoutSections(statementMd, isExamplesHeading),
    explanations,
    merged: true,
  };
}
