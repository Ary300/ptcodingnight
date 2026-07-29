"""Random input generator for "Solve Me First".

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce small-magnitude inputs; large seeds
produce inputs at the constraint ceiling.
"""

import random
import sys

LIMIT = 10 ** 9


def magnitude_for(seed: int) -> int:
    """Pick the magnitude ceiling for this seed: small seeds stay small."""
    if seed < 10:
        return 10
    if seed < 100:
        return 1000
    if seed < 1000:
        return 10 ** 6
    return LIMIT


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")

    seed = int(sys.argv[1])
    rng = random.Random(seed)

    cap = magnitude_for(seed)
    a = rng.randint(-cap, cap)
    b = rng.randint(-cap, cap)

    print(a)
    print(b)


if __name__ == "__main__":
    main()
