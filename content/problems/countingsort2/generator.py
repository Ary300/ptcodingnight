"""Counting Sort 2 -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny lists; larger seeds push n to
the constraint ceiling (seed >= 100 hits n = 10,000). The seed also selects the
shape of the list (seed % 7) so the test set covers degenerate cases (single
value, all equal, already sorted, reverse sorted, only the two extreme values,
a narrow band of values) and not just uniform noise.

Which seed made which test (01-02 are the statement samples; 03, 04 and 09 are
written by hand: n = 1 with value 0, n = 1 with value 99, and a shuffled
permutation of 0..99):

    05  seed 8     n = 64      a few dominant values in noise
    06  seed 16    n = 256     already sorted
    07  seed 17    n = 289     reverse sorted
    08  seed 25    n = 625     only 0 and 99
    10  seed 7     n = 49      uniform noise
    11  seed 40    n = 1600    narrow band of ten values
    12  seed 90    n = 8100    a few dominant values in noise
    13  seed 175   n = 10000   uniform noise
    14  seed 316   n = 10000   all equal
    15  seed 500   n = 10000   reverse sorted
    16  seed 702   n = 10000   already sorted
    17  seed 1005  n = 10000   only 0 and 99

Every value is at most 99 and n is at most 10,000, so nothing comes near the
32-bit range.
"""

import random
import sys

MAX_N = 10000
MAX_VALUE = 99


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 value, seed >= 100 -> the ceiling."""
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
