"""Random input generator for "Sales by Match".

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce small bins; large seeds push n and the
colour-code range toward the constraint ceiling.
"""

import random
import sys

MAX_N = 200000
MAX_CODE = 1000000


def choose_n(seed: int, rng: random.Random) -> int:
    """Small seeds -> tiny bins, large seeds -> bins at the constraint ceiling."""
    if seed < 10:
        return rng.randint(1, 10)
    if seed < 100:
        return rng.randint(10, 1000)
    if seed < 1000:
        return rng.randint(1000, 50000)
    return rng.randint(MAX_N // 2, MAX_N)


def choose_alphabet(seed: int, rng: random.Random) -> int:
    """Width of the colour-code pool: narrow means lots of pairs, wide means few."""
    if seed % 4 == 0:
        return 1
    if seed % 4 == 1:
        return rng.randint(2, 5)
    if seed % 4 == 2:
        return rng.randint(6, 1000)
    return MAX_CODE


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")

    seed = int(sys.argv[1])
    rng = random.Random(seed)

    n = choose_n(seed, rng)
    alphabet = choose_alphabet(seed, rng)

    pool = rng.sample(range(1, MAX_CODE + 1), alphabet) if alphabet <= 1000 else None

    if pool is not None:
        codes = [rng.choice(pool) for _ in range(n)]
    else:
        codes = [rng.randint(1, MAX_CODE) for _ in range(n)]

    out = sys.stdout
    out.write(str(n))
    out.write("\n")
    out.write(" ".join(str(code) for code in codes))
    out.write("\n")


if __name__ == "__main__":
    main()
