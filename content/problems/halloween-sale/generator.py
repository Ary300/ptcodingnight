"""Random input generator for "Halloween Sale".

Usage: python3 generator.py <seed>

Deterministic per seed.  Small seeds produce small, human-sized inputs; large
seeds push q, p, d and b up to the constraint ceiling.  The seed also picks a
shape per shopper so the generated data covers the degenerate cases: p == m
(price never moves), d >= p (price drops to the floor immediately), b == 0
(broke shopper) and b at the maximum (the division branch dominates).

The ceilings are sized for a casual contest: b stays at or below 100,000, so a
student who simulates one keychain at a time finishes every test quickly, and
every count, price and running total fits comfortably in a 32-bit int.

Which seed made which test:
  01, 02  the two samples from the statement, written by hand
  03      written by hand: a broke shopper at the smallest prices
  04      written by hand: every ceiling at once (p, d and b at the maximum,
          m at 1 and at p, and p == 1)
  05      written by hand: b just below, at and just above a single price
  06 = seed 1     07 = seed 2     08 = seed 4     09 = seed 9
  10 = seed 17    11 = seed 33    12 = seed 58    13 = seed 95
  14 = seed 140   15 = seed 500
"""

import random
import sys

MAX_Q = 20
MAX_P = 1000
MAX_D = 1000
MAX_B = 100000


def scale(seed: int) -> float:
    """0.0 for tiny seeds, 1.0 once the seed is large."""
    return min(1.0, seed / 120.0)


def choose_q(seed: int, rng: random.Random) -> int:
    f = scale(seed)
    if f >= 1.0:
        return MAX_Q
    return rng.randint(1, max(1, int(1 + (MAX_Q - 1) * f)))


def make_shopper(shape: int, f: float, rng: random.Random) -> tuple:
    p_top = max(2, int(3 + (MAX_P - 3) * f))
    d_top = max(1, int(2 + (MAX_D - 2) * f))
    b_top = max(1, int(30 + (MAX_B - 30) * f))

    p = rng.randint(1, p_top)

    if shape == 0:  # price never moves off the start
        m = p
    elif shape == 1:  # floor at the absolute minimum
        m = 1
    else:
        m = rng.randint(1, p)

    if shape == 2:  # one purchase and the price is already on the floor
        d = rng.randint(p, max(p, d_top))
    elif shape == 3:  # slowest possible decay
        d = 1
    else:
        d = rng.randint(1, d_top)

    if shape == 4:  # broke shopper
        b = 0
    elif shape == 5:  # rich shopper, the floor price does all the work
        b = b_top
    else:
        b = rng.randint(0, b_top)

    return p, d, m, b


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    f = scale(seed)
    q = choose_q(seed, rng)

    lines = [str(q)]
    for i in range(q):
        shape = (seed + i) % 7
        p, d, m, b = make_shopper(shape, f, rng)
        lines.append(f"{p} {d} {m} {b}")

    sys.stdout.write("\n".join(lines) + "\n")


main()
