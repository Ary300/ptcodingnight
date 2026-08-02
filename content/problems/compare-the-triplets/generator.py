"""Compare the Triplets -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The input is always two triples of ratings in 1..100;
the seed selects the shape so the test set covers the degenerate corners
(identical triples, one-sided sweeps, every position decided by exactly one
unit, ratings pinned to the constraint bounds) as well as uniform noise.
"""

import random
import sys

MIN_RATING = 1
MAX_RATING = 100


def build(seed: int, rng: random.Random) -> tuple[list[int], list[int]]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise on both sides.
        a = [rng.randint(MIN_RATING, MAX_RATING) for _ in range(3)]
        b = [rng.randint(MIN_RATING, MAX_RATING) for _ in range(3)]
        return a, b

    if shape == 1:
        # Identical triples: every position ties.
        a = [rng.randint(MIN_RATING, MAX_RATING) for _ in range(3)]
        return a, list(a)

    if shape == 2:
        # One-sided sweep: one contestant strictly higher everywhere.
        low = [rng.randint(MIN_RATING, MAX_RATING - 1) for _ in range(3)]
        high = [rng.randint(v + 1, MAX_RATING) for v in low]
        return (high, low) if rng.random() < 0.5 else (low, high)

    if shape == 3:
        # Every position decided by exactly one unit, random directions.
        a = []
        b = []
        for _ in range(3):
            v = rng.randint(MIN_RATING, MAX_RATING - 1)
            if rng.random() < 0.5:
                a.append(v + 1)
                b.append(v)
            else:
                a.append(v)
                b.append(v + 1)
        return a, b

    if shape == 4:
        # Ratings pinned to the constraint bounds only.
        a = [rng.choice((MIN_RATING, MAX_RATING)) for _ in range(3)]
        b = [rng.choice((MIN_RATING, MAX_RATING)) for _ in range(3)]
        return a, b

    # shape == 5: exactly one tied position, the other two random.
    tie_pos = rng.randrange(3)
    a = [rng.randint(MIN_RATING, MAX_RATING) for _ in range(3)]
    b = [rng.randint(MIN_RATING, MAX_RATING) for _ in range(3)]
    b[tie_pos] = a[tie_pos]
    return a, b


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    a, b = build(seed, rng)
    assert len(a) == 3 and len(b) == 3
    assert all(MIN_RATING <= v <= MAX_RATING for v in a + b)
    out = sys.stdout
    out.write(" ".join(str(v) for v in a))
    out.write("\n")
    out.write(" ".join(str(v) for v in b))
    out.write("\n")


if __name__ == "__main__":
    main()
