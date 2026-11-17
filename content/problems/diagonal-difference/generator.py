"""Diagonal Difference -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the matrix size and its shape so
the test set covers degenerate cases (1x1, all entries equal, symmetric
matrices where the diagonals cancel, entries pinned to both constraint
bounds, one huge off-diagonal outlier) as well as uniform noise, up to the
n = 100 ceiling. The ceiling is kept small on purpose: this is a casual contest,
students do not see the constraints, and a 100 x 100 grid of full-range values is
about 55 KB, so every test stays readable, a double loop over every cell is
instant in any language, and every sum fits easily in a 32-bit int (the gap is
at most 100 * 2 * 10^4 = 2 * 10^6 in absolute value).

Every generated grid with n > 1 has a nonzero answer (see break_balance), so a
program that prints 0 cannot pass them. Which seed made which test: 04 = seed 4,
05 = 7, 07 = 9, 08 = 22, 10 = 5, 12 = 35, 13 = 30, 14 = 300, 15 = 14,
16 = 940 (opposed diagonals at the ceiling), 17 = 996 (uniform noise at the
ceiling). The rest (01, 02, 03, 06, 09, 11) are written by hand.
"""

import random
import sys

MAX_N = 100
MAX_ABS = 10000


def choose_n(seed: int, rng: random.Random) -> int:
    """Small seeds give small matrices; seed >= 900 pins n to the ceiling."""
    if seed >= 900:
        return MAX_N
    if seed < 10:
        return max(1, seed)
    return rng.randint(2, min(MAX_N, seed))


def build_matrix(seed: int, n: int, rng: random.Random) -> list[list[int]]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full value range.
        return [[rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n)] for _ in range(n)]

    if shape == 1:
        # Every entry identical: both diagonal sums equal, answer 0.
        v = rng.randint(-MAX_ABS, MAX_ABS)
        return [[v] * n for _ in range(n)]

    if shape == 2:
        # Symmetric about the vertical axis: a[i][j] == a[i][n-1-j], so the
        # two diagonals hold the same multiset and the answer is 0.
        m = [[0] * n for _ in range(n)]
        for i in range(n):
            for j in range((n + 1) // 2):
                v = rng.randint(-MAX_ABS, MAX_ABS)
                m[i][j] = v
                m[i][n - 1 - j] = v
        return m

    if shape == 3:
        # Entries pinned to the two constraint bounds only.
        return [
            [rng.choice((-MAX_ABS, MAX_ABS)) for _ in range(n)]
            for _ in range(n)
        ]

    if shape == 4:
        # Diagonals maximally opposed: primary all +MAX_ABS, secondary all
        # -MAX_ABS (center of an odd matrix stays on the primary value),
        # everything else small noise.
        m = [[rng.randint(-9, 9) for _ in range(n)] for _ in range(n)]
        for i in range(n):
            m[i][n - 1 - i] = -MAX_ABS
        for i in range(n):
            m[i][i] = MAX_ABS
        return m

    # shape == 5: mostly zeros with a handful of large outliers, some of
    # which land on a diagonal and some of which do not.
    m = [[0] * n for _ in range(n)]
    for _ in range(max(1, n // 2)):
        i = rng.randrange(n)
        j = rng.randrange(n)
        m[i][j] = rng.choice((-MAX_ABS, MAX_ABS))
    return m


def diagonal_gap(m: list[list[int]]) -> int:
    n = len(m)
    return sum(m[i][i] for i in range(n)) - sum(m[i][n - 1 - i] for i in range(n))


def break_balance(m: list[list[int]], rng: random.Random) -> list[list[int]]:
    """Return a copy whose diagonals no longer balance, when n > 1 allows it.

    The flat, mirrored and bound-only shapes all tend to give 0, which is also what
    an untouched starter prints. A zero answer is kept for the hand-written edge
    cases (03, n = 1, and 06, a mirrored grid); generated grids get one cell that
    sits on exactly one diagonal nudged, so the sums differ by a nonzero amount.
    """
    n = len(m)
    if n < 2 or diagonal_gap(m) != 0:
        return m
    i = rng.choice([r for r in range(n) if r != n - 1 - r])
    shift = rng.randint(1, MAX_ABS)
    old = m[i][i]
    new = old - shift if old - shift >= -MAX_ABS else old + shift
    if new > MAX_ABS:
        new = -MAX_ABS if old != -MAX_ABS else MAX_ABS
    copy = [row[:] for row in m]
    copy[i][i] = new
    return copy


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    matrix = break_balance(build_matrix(seed, n, rng), rng)

    assert len(matrix) == n and all(len(row) == n for row in matrix)
    assert all(-MAX_ABS <= v <= MAX_ABS for row in matrix for v in row)
    assert n == 1 or diagonal_gap(matrix) != 0

    out = sys.stdout
    out.write(f"{n}\n")
    for row in matrix:
        out.write(" ".join(str(v) for v in row))
        out.write("\n")


if __name__ == "__main__":
    main()
