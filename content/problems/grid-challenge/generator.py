"""Grid Challenge -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce a single tiny grid; larger seeds emit
several grids per input and push n toward the ceiling. Beyond uniform noise the
shapes cover the cases the wording could hide: guaranteed-YES grids built from a
column-monotone matrix with every row shuffled, guaranteed-NO grids made by
reversing the row order of a YES grid, all-identical letters, identical rows, a
narrow alphabet full of duplicates, and n = 1.
"""

import random
import sys

MAX_T = 20
MAX_N = 300
ALPHA = "abcdefghijklmnopqrstuvwxyz"


def yes_matrix(n: int, rng: random.Random, lo: str = "a", hi: str = "z") -> list[str]:
    """Rows sorted AND columns non-decreasing.

    Row 0 is a sorted random row. Each later row picks, per column, a letter at
    least the one above, then sorts itself. For sorted a and elementwise b >= a,
    sorted(b) stays elementwise >= a, so the column property survives the sort.
    """
    lo_i, hi_i = ALPHA.index(lo), ALPHA.index(hi)
    row = sorted(rng.choice(ALPHA[lo_i : hi_i + 1]) for _ in range(n))
    grid = ["".join(row)]
    for _ in range(n - 1):
        raised = sorted(
            rng.choice(ALPHA[ALPHA.index(ch) : hi_i + 1]) if ch <= hi else ch
            for ch in row
        )
        grid.append("".join(raised))
        row = raised
    return grid


def shuffled(rows: list[str], rng: random.Random) -> list[str]:
    out = []
    for r in rows:
        letters = list(r)
        rng.shuffle(letters)
        out.append("".join(letters))
    return out


def no_matrix(n: int, rng: random.Random) -> list[str]:
    """A grid that sorts to at least one decreasing column. Requires n >= 2."""
    rows = yes_matrix(n, rng, lo="a", hi="y")
    if len(set(rows)) == 1:
        # Every row identical: bump one letter of the LAST row, which the
        # reversal below moves to the top, so a strictly smaller letter then
        # sits beneath it. hi="y" guarantees room to bump.
        bumped = list(rows[-1])
        bumped[-1] = ALPHA[ALPHA.index(bumped[-1]) + 1]
        rows[-1] = "".join(sorted(bumped))
    rows.reverse()
    return shuffled(rows, rng)


def build_case(shape: int, n: int, rng: random.Random) -> list[str]:
    if shape == 0:
        # Uniform noise over the full alphabet.
        return ["".join(rng.choice(ALPHA) for _ in range(n)) for _ in range(n)]
    if shape == 1:
        # Guaranteed YES, rows scrambled.
        return shuffled(yes_matrix(n, rng), rng)
    if shape == 2:
        # Guaranteed NO (falls back to noise when n == 1, which is always YES).
        return no_matrix(n, rng) if n >= 2 else ["a"]
    if shape == 3:
        # One letter everywhere.
        ch = rng.choice(ALPHA)
        return [ch * n for _ in range(n)]
    if shape == 4:
        # Identical rows.
        row = "".join(rng.choice(ALPHA) for _ in range(n))
        return [row for _ in range(n)]
    # shape == 5: narrow alphabet, duplicates everywhere.
    span = ALPHA[rng.randint(0, 23) :][:3]
    return ["".join(rng.choice(span) for _ in range(n)) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    if seed < 100:
        t = 1
        sizes = [max(1, min(MAX_N, seed))]
    else:
        t = rng.randint(2, MAX_T)
        sizes = [rng.randint(1, min(MAX_N, seed)) for _ in range(t)]

    out = sys.stdout
    out.write(f"{t}\n")
    for n in sizes:
        grid = build_case(rng.randrange(6), n, rng)
        assert len(grid) == n and all(len(r) == n for r in grid)
        assert all(all("a" <= c <= "z" for c in r) for r in grid)
        out.write(f"{n}\n")
        for r in grid:
            out.write(r + "\n")


if __name__ == "__main__":
    main()
