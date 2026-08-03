"""Orchard Routes -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny maps; seeds of 32 and above
push both dimensions to the 1000 x 1000 ceiling. The seed also selects the
shape of the map, so the test set covers empty orchards, sparse and dense tree
cover, single rows and columns, diagonal windbreaks with one gap each, and a
regular planting pattern, not just uniform noise.
"""

import random
import sys

MAX_R = 1000
MAX_C = 1000


def choose_dims(seed: int, rng: random.Random) -> tuple[int, int]:
    """Grow with the seed: seed 1 -> 1x1 territory, seed >= 32 -> the ceiling."""
    cap = max(1, min(MAX_R, seed * seed))
    if cap >= MAX_R:
        return MAX_R, MAX_C
    return rng.randint(1, cap), rng.randint(1, cap)


def random_grid(r: int, c: int, density: float, rng: random.Random) -> list[str]:
    grid = [
        ["#" if rng.random() < density else "." for _ in range(c)]
        for _ in range(r)
    ]
    grid[0][0] = "."
    grid[r - 1][c - 1] = "."
    return ["".join(row) for row in grid]


def build_map(seed: int, rng: random.Random) -> list[str]:
    shape = seed % 6
    r, c = choose_dims(seed, rng)

    if shape == 0:
        # Sparse-to-moderate uniform tree cover, endpoints kept open.
        return random_grid(r, c, rng.uniform(0.05, 0.35), rng)

    if shape == 1:
        # Completely open orchard: the pure binomial count.
        return ["." * c] * r

    if shape == 2:
        # Single row or single column with occasional trees.
        length = max(r, c)
        cells = ["#" if rng.random() < 0.1 else "." for _ in range(length)]
        cells[0] = "."
        cells[-1] = "."
        if rng.random() < 0.5:
            return ["".join(cells)]
        return cells

    if shape == 3:
        # Diagonal windbreaks: every step-th anti-diagonal is blocked except
        # one gap, so every route is forced through each gap in turn. The gap
        # rows are chosen so that each gap is reachable from the previous one
        # (a monotone walk can only move its row down by at most step between
        # consecutive walls), which keeps the route count positive.
        grid = [["."] * c for _ in range(r)]
        step = rng.randint(3, 8)
        prev_gap_row = 0
        for d in range(step, r + c - 2, step):
            lo = max(prev_gap_row, d - (c - 1), 0)
            hi = min(r - 1, d, prev_gap_row + step)
            gap_row = rng.randint(lo, max(lo, hi))
            for i in range(r):
                j = d - i
                if 0 <= j < c and i != gap_row:
                    grid[i][j] = "#"
            prev_gap_row = gap_row
        grid[0][0] = "."
        grid[r - 1][c - 1] = "."
        return ["".join(row) for row in grid]

    if shape == 4:
        # Regular planting pattern: a tree on every odd-odd plot, with the
        # endpoints kept open so the pattern constrains rather than kills
        # every route.
        grid = [
            ["#" if (i % 2 == 1 and j % 2 == 1) else "." for j in range(c)]
            for i in range(r)
        ]
        grid[0][0] = "."
        grid[r - 1][c - 1] = "."
        return ["".join(row) for row in grid]

    # shape == 5: dense tree cover; routes are rare or nonexistent.
    return random_grid(r, c, rng.uniform(0.45, 0.65), rng)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    grid = build_map(seed, rng)
    out = [f"{len(grid)} {len(grid[0])}"]
    out.extend(grid)
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
