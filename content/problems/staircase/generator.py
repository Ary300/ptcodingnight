"""Staircase -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The input is a single integer n, so coverage means
covering the height range: small seeds pin the exact boundary heights (1, 2,
3, 99, 100), and every other seed draws n from a band that widens with the
seed so the test set spans the whole constraint range rather than clustering.
"""

import random
import sys

MAX_N = 100

PINNED = {1: 1, 2: 2, 3: 3, 4: 99, 5: MAX_N}


def choose_n(seed: int, rng: random.Random) -> int:
    pinned = PINNED.get(seed)
    if pinned is not None:
        return pinned
    lo = 1 + (seed * 7) % 40
    hi = min(MAX_N, lo + 10 + (seed * 13) % 60)
    return rng.randint(lo, hi)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    assert 1 <= n <= MAX_N
    sys.stdout.write(f"{n}\n")


if __name__ == "__main__":
    main()
