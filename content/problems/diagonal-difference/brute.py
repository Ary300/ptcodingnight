"""Diagonal Difference -- brute-force check solution.

Deliberately naive: build the whole matrix, then scan every cell and test its
coordinates against the diagonal conditions directly (i == j for the primary,
i + j == n - 1 for the secondary). Same answer as the reference by a different
route; used for stress testing, not speed.
"""

import sys


def main() -> None:
    lines = sys.stdin.read().split("\n")
    n = int(lines[0])
    matrix = [[int(x) for x in lines[1 + i].split()] for i in range(n)]

    primary = 0
    secondary = 0
    for i in range(n):
        for j in range(n):
            if i == j:
                primary += matrix[i][j]
            if i + j == n - 1:
                secondary += matrix[i][j]

    diff = primary - secondary
    if diff < 0:
        diff = -diff
    print(diff)


if __name__ == "__main__":
    main()
