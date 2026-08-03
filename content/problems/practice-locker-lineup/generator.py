"""Locker Lineup -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed controls both the corridor length (small
seeds give short corridors, seeds of 448 or more hit the ceiling) and the
shape of the plate sequence, so the test set covers degenerate corridors
(single locker, all plates equal, fully sorted, fully reversed, heavy
duplicates, boundary values) and not just uniform noise.
"""

import random
import sys

MAX_N = 200000
MAX_VALUE = 10**9


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 locker, seed >= 448 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_plates(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full value range.
        return [rng.randint(1, MAX_VALUE) for _ in range(n)]

    if shape == 1:
        # Every plate carries the same number.
        value = rng.randint(1, MAX_VALUE)
        return [value] * n

    if shape == 2:
        # Strictly increasing: every step is a rise.
        picks = rng.sample(range(1, MAX_VALUE + 1), n)
        return sorted(picks)

    if shape == 3:
        # Strictly decreasing: no step is a rise.
        picks = rng.sample(range(1, MAX_VALUE + 1), n)
        return sorted(picks, reverse=True)

    if shape == 4:
        # Heavy duplicates: values drawn from a tiny pool, many flat steps.
        pool_size = rng.randint(2, 5)
        pool = rng.sample(range(1, MAX_VALUE + 1), pool_size)
        return [rng.choice(pool) for _ in range(n)]

    if shape == 5:
        # Alternating low and high: nearly every other step is a rise.
        low = rng.randint(1, MAX_VALUE // 2)
        high = rng.randint(MAX_VALUE // 2 + 1, MAX_VALUE)
        return [high if i % 2 else low for i in range(n)]

    # shape == 6: only the boundary values 1 and 10^9 appear.
    return [rng.choice((1, MAX_VALUE)) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    plates = build_plates(seed, n, rng)
    assert len(plates) == n
    assert all(1 <= v <= MAX_VALUE for v in plates)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in plates))
    out.write("\n")


if __name__ == "__main__":
    main()
