"""Minimum Absolute Difference in an Array -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny arrays; large seeds push n to
the constraint ceiling. The seed also selects a shape so the test set covers
adversarial layouts (all-equal arrays, sorted and reverse-sorted input, tight
duplicate-heavy ranges, far-apart clusters hiding one close pair, arithmetic
progressions, values pinned to the +-10^9 boundary) and not just uniform noise.
"""

import random
import sys

MAX_N = 2000
MAX_ABS = 10**9


def choose_n(seed: int, rng: random.Random) -> int:
    """Grow with the seed: seed 1 -> n = 2, seed >= 45 -> the ceiling."""
    return max(2, min(MAX_N, seed * seed))


def build_array(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 8

    if shape == 0:
        # Uniform noise over the full value range.
        return [rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n)]

    if shape == 1:
        # Every entry identical: the answer is 0.
        value = rng.randint(-MAX_ABS, MAX_ABS)
        return [value] * n

    if shape == 2:
        # Strictly increasing: already sorted, all values distinct.
        step_cap = max(1, (2 * MAX_ABS) // max(n, 1) - 1)
        values = []
        current = -MAX_ABS
        for _ in range(n):
            values.append(current)
            current += rng.randint(1, step_cap)
        return values

    if shape == 3:
        # Strictly decreasing: reverse-sorted input.
        step_cap = max(1, (2 * MAX_ABS) // max(n, 1) - 1)
        values = []
        current = MAX_ABS
        for _ in range(n):
            values.append(current)
            current -= rng.randint(1, step_cap)
        return values

    if shape == 4:
        # Tiny value range: duplicates are almost guaranteed.
        low = rng.randint(-MAX_ABS, MAX_ABS - n)
        return [low + rng.randint(0, max(1, n // 2)) for _ in range(n)]

    if shape == 5:
        # Two clusters near the boundaries, one deliberately close pair.
        values = [
            rng.choice([-1, 1]) * (MAX_ABS - rng.randint(0, 10**6))
            for _ in range(n - 2)
        ]
        anchor = rng.randint(-MAX_ABS // 2, MAX_ABS // 2)
        values += [anchor, anchor + rng.randint(0, 3)]
        rng.shuffle(values)
        return values

    if shape == 6:
        # Arithmetic progression: every adjacent gap ties for the minimum.
        step = rng.randint(1, max(1, (2 * MAX_ABS) // max(n, 1)))
        start = rng.randint(-MAX_ABS, MAX_ABS - step * (n - 1))
        values = [start + i * step for i in range(n)]
        rng.shuffle(values)
        return values

    # shape == 7: mostly noise, with the extreme values pinned in.
    values = [rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n)]
    values[0] = -MAX_ABS
    values[-1] = MAX_ABS
    rng.shuffle(values)
    return values


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    values = build_array(seed, n, rng)
    assert len(values) == n
    assert all(-MAX_ABS <= v <= MAX_ABS for v in values)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
