"""Mini-Max Sum -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The input is always exactly five integers, so the seed
selects the shape of the values rather than the size: uniform noise over the
full range, all-equal crates, tied extremes, values pinned to the constraint
bounds, and near-ceiling loads that force 64-bit sums.
"""

import random
import sys

MAX_VALUE = 10**9


def build_values(seed: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full range.
        return [rng.randint(0, MAX_VALUE) for _ in range(5)]

    if shape == 1:
        # Every crate weighs the same.
        v = rng.randint(0, MAX_VALUE)
        return [v] * 5

    if shape == 2:
        # Tied minimum and tied maximum, one filler in between.
        lo = rng.randint(0, MAX_VALUE // 2)
        hi = rng.randint(lo, MAX_VALUE)
        mid = rng.randint(lo, hi)
        values = [lo, lo, hi, hi, mid]
        rng.shuffle(values)
        return values

    if shape == 3:
        # Values pinned to the constraint bounds plus noise.
        values = [0, MAX_VALUE] + [rng.choice([0, 1, MAX_VALUE - 1, MAX_VALUE]) for _ in range(3)]
        rng.shuffle(values)
        return values

    if shape == 4:
        # Small values only; sums stay tiny.
        return [rng.randint(0, 50) for _ in range(5)]

    # shape == 5: everything near the ceiling, so any sum of four overflows 32 bits.
    values = [MAX_VALUE - rng.randint(0, 1000) for _ in range(5)]
    rng.shuffle(values)
    return values


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    values = build_values(seed, rng)
    assert len(values) == 5
    assert all(0 <= v <= MAX_VALUE for v in values)
    sys.stdout.write(" ".join(str(v) for v in values))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
