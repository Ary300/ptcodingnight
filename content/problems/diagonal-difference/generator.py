"""Diagonal Difference -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the matrix size and its shape so
the test set covers degenerate cases (1x1, all entries equal, symmetric
matrices where the diagonals cancel, entries pinned to both constraint
bounds, one huge off-diagonal outlier) as well as uniform noise, up to the
n = 1000 ceiling.
"""

import random
import sys

MAX_N = 1000
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


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    matrix = build_matrix(seed, n, rng)

    assert len(matrix) == n and all(len(row) == n for row in matrix)
    assert all(-MAX_ABS <= v <= MAX_ABS for row in matrix for v in row)

    out = sys.stdout
    out.write(f"{n}\n")
    for row in matrix:
        out.write(" ".join(str(v) for v in row))
        out.write("\n")


if __name__ == "__main__":
    main()
