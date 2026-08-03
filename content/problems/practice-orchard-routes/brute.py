"""Orchard Routes -- brute force.

Definition-literal: enumerates every monotone (south/east) walk from the
northwest plot by depth-first search and counts the ones that reach the
southeast plot. Exponential in r + c, so it exists only to cross-check the
reference on small grids; it cannot finish any full-size test.
"""

import sys

MOD = 10**9 + 7


def main() -> None:
    sys.setrecursionlimit(1 << 16)
    data = sys.stdin.buffer.read().split()
    r = int(data[0])
    c = int(data[1])
    grid = [row.decode() for row in data[2:2 + r]]

    def walk(i: int, j: int) -> int:
        if grid[i][j] == "#":
            return 0
        if i == r - 1 and j == c - 1:
            return 1
        total = 0
        if i + 1 < r:
            total += walk(i + 1, j)
        if j + 1 < c:
            total += walk(i, j + 1)
        return total

    print(walk(0, 0) % MOD)


if __name__ == "__main__":
    main()
