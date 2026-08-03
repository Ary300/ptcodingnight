"""Sherlock and The Beast -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. seed % 6 selects the shape of the query batch so the
test set covers the impossible lengths (only 1, 2, 4 and 7 have no answer),
every residue class of n mod 15 (which decides the five/three split), lengths
at and near the constraint ceiling, and uniform noise, rather than noise alone.
"""

import random
import sys

MAX_N = 100000
MAX_T = 20


def build_queries(seed: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise across the whole range.
        t = rng.randint(1, MAX_T)
        return [rng.randint(1, MAX_N) for _ in range(t)]

    if shape == 1:
        # Tiny lengths: hits every -1 case and the smallest legal splits.
        t = rng.randint(4, MAX_T)
        return [rng.randint(1, 30) for _ in range(t)]

    if shape == 2:
        # Clustered just below the ceiling.
        return [MAX_N - rng.randint(0, 40) for _ in range(MAX_T)]

    if shape == 3:
        # Multiples of 15 (pure fives) and of 5 (three-heavy tails).
        t = rng.randint(2, MAX_T)
        return [
            rng.randint(1, MAX_N // 15) * (15 if rng.random() < 0.5 else 5)
            for _ in range(t)
        ]

    if shape == 4:
        # Worst case: every query at the ceiling.
        return [MAX_N] * MAX_T

    # shape == 5: one medium n from each residue class mod 15.
    base = rng.randint(1, (MAX_N - 15) // 15) * 15
    queries = [base + r for r in range(15)]
    rng.shuffle(queries)
    return queries


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    queries = build_queries(seed, rng)
    assert 1 <= len(queries) <= MAX_T
    assert all(1 <= n <= MAX_N for n in queries)
    out = sys.stdout
    out.write(f"{len(queries)}\n")
    for n in queries:
        out.write(f"{n}\n")


if __name__ == "__main__":
    main()
