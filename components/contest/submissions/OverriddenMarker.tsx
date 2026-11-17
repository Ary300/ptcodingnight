/**
 * "Overridden", beside a verdict an organizer set by hand.
 *
 * An override changes a verdict and a score the student has already seen, and the console and My
 * submissions showed the new verdict with nothing to say a person had set it. A word, never a
 * colour alone (DESIGN.md §3), on the same outline chip as the other quiet tokens.
 */
export function OverriddenMarker() {
  return (
    <span
      data-testid="overridden-marker"
      className="inline-block whitespace-nowrap rounded-chip border border-rule-firm px-1.5 py-0.5 font-semibold text-ink/75"
      style={{ fontSize: "var(--text-xs)" }}
      title="An organizer set this verdict and score."
    >
      Overridden
    </span>
  );
}
