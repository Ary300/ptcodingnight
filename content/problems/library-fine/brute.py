"""Library Fine -- brute / definition-literal solution.

The task is O(1) by definition, so there is no honest slow variant. This is
the most table-literal implementation possible: it walks the statement's fine
table row by row with explicit nested comparisons and no tuple ordering, so a
mistake in either script's reading of the table shows up as a diff.
"""

import sys


def fine_for(d_r: int, m_r: int, y_r: int, d_e: int, m_e: int, y_e: int) -> int:
    # Row 1: returned on or before the due date.
    if y_r < y_e:
        return 0
    if y_r == y_e and m_r < m_e:
        return 0
    if y_r == y_e and m_r == m_e and d_r <= d_e:
        return 0
    # Row 2: later year, flat charge.
    if y_r > y_e:
        return 10000
    # Row 3: same year, later month.
    if m_r > m_e:
        return 500 * (m_r - m_e)
    # Row 4: same year and month, later day.
    return 15 * (d_r - d_e)


def main() -> None:
    data = sys.stdin.read().split()
    values = [int(x) for x in data[:6]]
    print(fine_for(*values))


if __name__ == "__main__":
    main()
