"""Diagonal Difference -- reference solution.

Read the n x n matrix as one flat token stream and walk both diagonals by
index arithmetic: row i contributes tokens[i * n + i] to the primary diagonal
and tokens[i * n + (n - 1 - i)] to the secondary diagonal. O(n) additions
after the O(n^2) read; no matrix is materialized.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    cells = data[1:1 + n * n]

    primary = 0
    secondary = 0
    for i in range(n):
        row_base = i * n
        primary += int(cells[row_base + i])
        secondary += int(cells[row_base + (n - 1 - i)])

    print(abs(primary - secondary))


if __name__ == "__main__":
    main()
