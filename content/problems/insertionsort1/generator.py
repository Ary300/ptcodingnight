"""Insertion Sort - Part 1 -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny arrays; large seeds push n
to the constraint ceiling. The seed also selects the shape of the array so
the test set covers the degenerate walks (no copies at all, a copy for every
prefix element, a stop caused by an equal value) and not just uniform noise.
The sorted-prefix invariant is asserted before anything is printed.
"""

import random
import sys

MAX_N = 1000
MAX_ABS = 10000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_array(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if n == 1:
        return [rng.randint(-MAX_ABS, MAX_ABS)]

    if shape == 0:
        # Uniform noise: sorted prefix, random last value.
        prefix = sorted(rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n - 1))
        return prefix + [rng.randint(-MAX_ABS, MAX_ABS)]

    if shape == 1:
        # Full walk: the last value is strictly below the whole prefix.
        prefix = sorted(rng.randint(-MAX_ABS + 1, MAX_ABS) for _ in range(n - 1))
        return prefix + [min(prefix) - 1]

    if shape == 2:
        # No copies: the last value is at least the prefix maximum.
        prefix = sorted(rng.randint(-MAX_ABS, MAX_ABS - 1) for _ in range(n - 1))
        return prefix + [rng.randint(max(prefix), MAX_ABS)]

    if shape == 3:
        # Every element equal: the strict comparison must copy nothing.
        v = rng.randint(-MAX_ABS, MAX_ABS)
        return [v] * n

    if shape == 4:
        # Duplicate-heavy prefix from a tiny value pool, last value from
        # the same pool, so the walk often stops on an equal value.
        pool = sorted(rng.sample(range(-50, 51), 3))
        prefix = sorted(rng.choice(pool) for _ in range(n - 1))
        return prefix + [rng.choice(pool)]

    # shape == 5: values pinned to the constraint bounds.
    prefix = sorted(rng.choice((-MAX_ABS, 0, MAX_ABS)) for _ in range(n - 1))
    return prefix + [rng.choice((-MAX_ABS, MAX_ABS))]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    arr = build_array(seed, n, rng)
    assert len(arr) == n
    assert all(-MAX_ABS <= v <= MAX_ABS for v in arr)
    assert all(arr[i] <= arr[i + 1] for i in range(n - 2))
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in arr))
    out.write("\n")


if __name__ == "__main__":
    main()
