"""Insertion Sort - Part 2 -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the array size (small seeds give
tiny arrays, seeds of 10 and above reach the n = 100 ceiling) and the shape, so the
test set covers the degenerate cases (single element, all equal, already
sorted, reverse sorted, boundary values, heavy duplicates) rather than only
uniform noise.

tests/ was produced with these seeds (01 and 02 are the samples, 04 and 05 are
written by hand): 03=1, 06=8, 07=9, 08=3, 09=11, 10=12, 11=13, 12=7, 13=14,
14=21, 15=38, 16=35.
"""

import random
import sys

MAX_N = 100
MAX_ABS = 10**6


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 10 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_array(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise across the full value range.
        return [rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n)]

    if shape == 1:
        # Every element identical: no insertion ever moves anything.
        v = rng.randint(-MAX_ABS, MAX_ABS)
        return [v] * n

    if shape == 2:
        # Already sorted ascending.
        return sorted(rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n))

    if shape == 3:
        # Reverse sorted: every insertion shifts the whole prefix.
        return sorted(
            (rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n)), reverse=True
        )

    if shape == 4:
        # Heavy duplicates drawn from a tiny pool.
        pool = [rng.randint(-MAX_ABS, MAX_ABS) for _ in range(max(2, n // 20))]
        return [rng.choice(pool) for _ in range(n)]

    if shape == 5:
        # Boundary values mixed with noise.
        arr = [rng.choice([-MAX_ABS, MAX_ABS]) for _ in range(n)]
        for i in range(n):
            if rng.random() < 0.3:
                arr[i] = rng.randint(-MAX_ABS, MAX_ABS)
        return arr

    # shape == 6: nearly sorted with the minimum stranded at the far end.
    arr = sorted(rng.randint(-MAX_ABS + 1, MAX_ABS) for _ in range(n))
    if n > 1:
        arr[-1] = -MAX_ABS
    return arr


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    arr = build_array(seed, n, rng)
    assert len(arr) == n
    assert all(-MAX_ABS <= v <= MAX_ABS for v in arr)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in arr))
    out.write("\n")


if __name__ == "__main__":
    main()
