"""The Warmer Reading -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Seeds 1 and 2 are the two samples from the statement. The seed then
selects a shape so the set covers equal readings, the larger value in either position, readings
on both sides of zero, and both bounds, as well as ordinary temperatures.
"""

import random
import sys

LIMIT = 1_000_000

FIXED = {
    1: (41, 58),
    2: (-3, -9),
    3: (0, 0),
    4: (72, 72),
    5: (LIMIT, -LIMIT),
    6: (-LIMIT, LIMIT),
    7: (-LIMIT, -LIMIT),
    8: (-1, 0),
}


def pair_for(seed: int) -> tuple[int, int]:
    if seed in FIXED:
        return FIXED[seed]
    rng = random.Random(seed)
    shape = seed % 3
    if shape == 0:
        # Ordinary Indianapolis temperatures, larger first.
        a, b = rng.randint(-10, 100), rng.randint(-10, 100)
        return max(a, b), min(a, b)
    if shape == 1:
        # Anywhere in the range, larger second.
        a, b = rng.randint(-LIMIT, LIMIT), rng.randint(-LIMIT, LIMIT)
        return min(a, b), max(a, b)
    # Both negative, either order.
    return rng.randint(-LIMIT, -1), rng.randint(-LIMIT, -1)


def main() -> None:
    seed = int(sys.argv[1])
    a, b = pair_for(seed)
    assert -LIMIT <= a <= LIMIT and -LIMIT <= b <= LIMIT
    sys.stdout.write(f"{a} {b}\n")


if __name__ == "__main__":
    main()
