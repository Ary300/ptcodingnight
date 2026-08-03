"""Counting Sort 2 -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny lists; large seeds push n to
the constraint ceiling (seed >= 1000 hits n = 10^6). The seed also selects the
shape of the list so the test set covers degenerate cases (single value, all
equal, already sorted, reverse sorted, only the two extreme values, a narrow
band of values) and not just uniform noise.
"""

import random
import sys

MAX_N = 1_000_000
MAX_VALUE = 99


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 value, seed >= 1000 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_values(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full value range.
        return [rng.randint(0, MAX_VALUE) for _ in range(n)]

    if shape == 1:
        # Every entry is the same value.
        value = rng.randint(0, MAX_VALUE)
        return [value] * n

    if shape == 2:
        # Already sorted ascending: the output must equal the input.
        return sorted(rng.randint(0, MAX_VALUE) for _ in range(n))

    if shape == 3:
        # Reverse sorted: the worst arrangement for a naive insertion sort.
        return sorted((rng.randint(0, MAX_VALUE) for _ in range(n)), reverse=True)

    if shape == 4:
        # Only the two extreme values, mixed.
        return [0 if rng.random() < 0.5 else MAX_VALUE for _ in range(n)]

    if shape == 5:
        # A narrow band of ten consecutive values: heavy duplication.
        low = rng.randint(0, MAX_VALUE - 9)
        return [rng.randint(low, low + 9) for _ in range(n)]

    # shape == 6: a few dominant values buried in uniform noise.
    dominants = rng.sample(range(0, MAX_VALUE + 1), 3)
    values = []
    for _ in range(n):
        if rng.random() < 0.7:
            values.append(rng.choice(dominants))
        else:
            values.append(rng.randint(0, MAX_VALUE))
    return values


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    values = build_values(seed, n, rng)
    assert len(values) == n
    assert all(0 <= v <= MAX_VALUE for v in values)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
