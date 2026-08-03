"""Counting Sort 1 -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short lists; large seeds push n to
the constraint ceiling. The seed also picks the shape of the list so the test
set covers degenerate cases (a single value, every entry identical, only the
extremes 0 and 99, a fully sorted or reverse-sorted list, every value exactly
once) and not just uniform noise.
"""

import random
import sys

MAX_N = 100000
MAX_VALUE = 99


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 value, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_list(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full value range.
        return [rng.randint(0, MAX_VALUE) for _ in range(n)]

    if shape == 1:
        # Every entry is the same value.
        value = rng.randint(0, MAX_VALUE)
        return [value] * n

    if shape == 2:
        # Only the two extremes, in random order.
        return [rng.choice((0, MAX_VALUE)) for _ in range(n)]

    if shape == 3:
        # Fully sorted: values cycle 0..99 and then get sorted.
        return sorted((i % (MAX_VALUE + 1)) for i in range(n))

    if shape == 4:
        # Reverse sorted.
        return sorted(
            (rng.randint(0, MAX_VALUE) for _ in range(n)), reverse=True
        )

    if shape == 5:
        # A narrow band of values, so most of the 100 counts stay zero.
        low = rng.randint(0, MAX_VALUE - 3)
        return [rng.randint(low, low + 3) for _ in range(n)]

    # shape == 6: one dominant value buried in noise.
    heavy = rng.randint(0, MAX_VALUE)
    values = [
        heavy if rng.random() < 0.7 else rng.randint(0, MAX_VALUE)
        for _ in range(n)
    ]
    rng.shuffle(values)
    return values


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    values = build_list(seed, n, rng)
    assert len(values) == n
    assert all(0 <= v <= MAX_VALUE for v in values)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
