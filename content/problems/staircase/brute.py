"""Staircase -- brute-force check.

Deliberately different construction from reference.py: fill an n-by-n grid of
spaces one cell at a time, marking cell (r, c) with '#' exactly when the column
is far enough right to belong to row r's step, then strip each row's trailing
gap by never having one (the '#' run always ends at the last column).
"""

import sys


def main() -> None:
    n = int(sys.stdin.read().split()[0])
    grid = [[" "] * n for _ in range(n)]
    for r in range(n):        # r = 0 is the top row, which has 1 hash
        for c in range(n):
            if c >= n - (r + 1):
                grid[r][c] = "#"
    for row in grid:
        sys.stdout.write("".join(row) + "\n")


if __name__ == "__main__":
    main()
