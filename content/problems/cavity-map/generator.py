"""Cavity Map -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the grid side length (small seeds
give tiny grids, large seeds reach the n = 500 ceiling) and the grid shape, so
the test set covers degenerate and adversarial layouts, not just uniform
noise: grids with no interior at all (n = 1, 2), a single constant digit,
plateau grids drawn from two adjacent digits (equality everywhere, so
strictness matters), sorted and reverse-sorted rows, and a lattice that packs
in the maximum possible number of cavities.
"""

import random
import sys

MAX_N = 500


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> n = 1, seed >= 23 -> the ceiling."""
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
