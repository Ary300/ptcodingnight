/**
 * When are two hand-typed awards the same award?
 *
 * Pure and dependency-free, because two places ask: the server refuses a duplicate until it is
 * confirmed, and the entry screen warns before the button is pressed. One definition, so the
 * warning and the refusal can never disagree.
 *
 * The label is compared after trimming, collapsing inner spaces and folding case. "Sudoku, seat A"
 * and "sudoku,  seat a" are the same award; "Sudoku, seat B" is not.
 */
export function normalizeAwardSource(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sameAwardSource(a: string, b: string): boolean {
  return normalizeAwardSource(a) === normalizeAwardSource(b);
}
