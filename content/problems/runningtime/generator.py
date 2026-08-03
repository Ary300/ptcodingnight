"""Running Time of Algorithms -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the array size and its shape,
so the test set covers sorted, reverse-sorted, constant, duplicate-heavy,
nearly sorted, and two-value arrays as well as uniform noise across the
full value range.
"""

import random
import sys

MAX_N = 1000
MAX_V = 10**6


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise across the full value range.
        return [rng.randint(1, MAX_V) for _ in range(n)]

    if shape == 1:
        # Already sorted ascending: zero shifts.
        return sorted(rng.randint(1, MAX_V) for _ in range(n))

    if shape == 2:
        # Reverse sorted distinct values: the maximum possible shift count.
        return sorted(rng.sample(range(1, MAX_V + 1), n), reverse=True)

    if shape == 3:
        # Every element identical: zero shifts despite maximal "sortedness" doubt.
        return [rng.randint(1, MAX_V)] * n

    if shape == 4:
        # Duplicate-heavy: only a handful of distinct values.
        distinct = rng.randint(1, min(5, n))
        pool = rng.sample(range(1, MAX_V + 1), distinct)
        return [rng.choice(pool) for _ in range(n)]

    if shape == 5:
        # Nearly sorted: a sorted array with a few random adjacent swaps.
        arr = sorted(rng.randint(1, MAX_V) for _ in range(n))
        swaps = max(1, n // 20)
        for _ in range(swaps):
            k = rng.randint(0, n - 2) if n >= 2 else 0
            if n >= 2:
                arr[k], arr[k + 1] = arr[k + 1], arr[k]
        return arr

    # shape == 6: only the two boundary values, interleaved at random.
    return [rng.choice((1, MAX_V)) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    arr = build(seed, n, rng)
    assert len(arr) == n
    assert all(1 <= v <= MAX_V for v in arr)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in arr))
    out.write("\n")


if __name__ == "__main__":
    main()
