/**
 * How a student sees a problem named in a single line: "P1 (Two Tables, One Total)".
 *
 * A slot label alone ("P1") means nothing to a student who has not memorised the lobby, so
 * anywhere a problem is named by one string, the label carries its title in parentheses. The
 * title stays the H1 of the problem page; this is for crumbs, history rows and the like.
 *
 * A blank slot label falls back to the title alone, so an organizer who never labelled a slot
 * does not produce " (Title)" with a stray space and an orphaned bracket.
 */
export function problemLabel(slotLabel: string, title: string): string {
  const slot = slotLabel.trim();
  const name = title.trim();
  if (slot === "") return name;
  if (name === "" || name === slot) return slot;
  return `${slot} (${name})`;
}
