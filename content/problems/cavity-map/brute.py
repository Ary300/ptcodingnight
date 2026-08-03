"""Cavity Map -- brute / definition-literal solution.

Same O(n^2) complexity as the reference (the task is a single grid pass by
definition, so no honestly slower variant exists), but a different mechanism:
integer depths, explicit coordinate offsets, and a per-cell border test with
all() over the gathered neighbour list, instead of the reference's in-row
character comparisons.
"""

import sys

OFFSETS = ((-1, 0), (1, 0), (0, -1), (0, 1))


def is_cavity(depths: list[list[int]], n: int, i: int, j: int) -> bool:
    if i == 0 or j == 0 or i == n - 1 or j == n - 1:
        return False
    neighbours = [depths[i + di][j + dj] for di, dj in OFFSETS]
    return all(depths[i][j] > nb for nb in neighbours)


def main() -> None:
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    rows = tokens[1:1 + n]
    depths = [[int(ch) for ch in row] for row in rows]

    lines = []
    for i in range(n):
        cells = []
        for j in range(n):
            if is_cavity(depths, n, i, j):
                cells.append("X")
            else:
                cells.append(rows[i][j])
        lines.append("".join(cells))

    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
