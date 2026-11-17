"""Cavity Map -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the grid side length (small seeds
give tiny grids, large seeds reach the n = 100 ceiling) and the grid shape, so
the test set covers degenerate and adversarial layouts, not just uniform
noise: grids with no interior at all (n = 1, 2), a single constant digit,
plateau grids drawn from two adjacent digits (equality everywhere, so
strictness matters), sorted and reverse-sorted rows, and a lattice that packs
in the maximum possible number of cavities.

The ceiling is 100 so the largest grid is about 10 KB, a size a casual contest
reads comfortably; every shape still appears at full size.

Which seed made which test (tests 01-06 are written by hand: 01 and 02 are the
statement's samples, 03 is n = 1, 04 is n = 2, 05 and 06 are n = 3):

    07: seed 7  (n = 49,  constant digit)
    08: seed 9  (n = 81,  rows ascending)
    09: seed 10 (n = 100, rows descending)
    10: seed 11 (n = 100, max-cavity lattice)
    11: seed 8  (n = 64,  two-digit plateau)
    12: seed 6  (n = 36,  uniform noise)
    13: seed 12 (n = 100, uniform noise)
    14: seed 14 (n = 100, two-digit plateau)
    15: seed 17 (n = 100, max-cavity lattice)
    16: seed 26 (n = 100, two-digit plateau)
    17: seed 27 (n = 100, rows ascending)
    18: seed 24 (n = 100, uniform noise)
"""

import random
import sys

MAX_N = 100


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> n = 1, seed >= 10 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_grid(seed: int, n: int, rng: random.Random) -> list[str]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full digit range.
        return ["".join(str(rng.randint(1, 9)) for _ in range(n)) for _ in range(n)]

    if shape == 1:
        # Every cell the same digit: zero cavities, all comparisons are ties.
        d = str(rng.randint(1, 9))
        return [d * n] * n

    if shape == 2:
        # Plateau grid from two adjacent digits: equality is everywhere, so a
        # solution that uses >= instead of > over-flags heavily here.
        lo = rng.randint(1, 8)
        return [
            "".join(str(rng.choice((lo, lo + 1))) for _ in range(n))
            for _ in range(n)
        ]

    if shape == 3:
        # Rows sorted ascending (digits cycle 1..9): no cell beats its right
        # neighbour except at the 9 -> 1 seam, which its row placement guards.
        return [
            "".join(str((j % 9) + 1) for j in range(n))
            for _ in range(n)
        ]

    if shape == 4:
        # Rows sorted descending: mirror of shape 3.
        return [
            "".join(str(9 - (j % 9)) for j in range(n))
            for _ in range(n)
        ]

    # shape == 5: maximum-cavity lattice. A 9 on every odd-odd cell, low noise
    # elsewhere, so every interior odd-odd cell is a cavity and no two flagged
    # cells are adjacent (they cannot be, by strictness).
    grid = []
    for i in range(n):
        row = []
        for j in range(n):
            if i % 2 == 1 and j % 2 == 1:
                row.append("9")
            else:
                row.append(str(rng.randint(1, 4)))
        grid.append("".join(row))
    return grid


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    grid = build_grid(seed, n, rng)
    assert len(grid) == n
    assert all(len(row) == n for row in grid)
    assert all(ch in "123456789" for row in grid for ch in row)
    out = sys.stdout
    out.write(f"{n}\n")
    for row in grid:
        out.write(row)
        out.write("\n")


if __name__ == "__main__":
    main()
