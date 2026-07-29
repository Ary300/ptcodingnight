"""Deterministic random input generator.

Usage: python3 generator.py <seed>

Small seeds produce small ranges; large seeds push toward the constraint
ceiling (b up to 1,000,000).
"""
import random
import sys

MAX_N = 1_000_000
MAX_K = 20


def ceiling_for(seed: int) -> int:
    """Upper bound on ticket numbers, scaling with the seed."""
    if seed < 10:
        return 100
    if seed < 100:
        return 10_000
    if seed < 1_000:
        return 200_000
    return MAX_N


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    top = ceiling_for(seed)
    a = rng.randint(1, top)
    b = rng.randint(a, top)
    k = rng.randint(1, MAX_K)

    print(a, b, k)


if __name__ == "__main__":
    main()
