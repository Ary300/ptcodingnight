"""Random input generator for "Cut the sticks".

Usage: python3 generator.py <seed>

Deterministic per seed.  Small seeds produce small inputs; large seeds produce
inputs at the constraint ceiling.  The seed also selects a shape so that the
generated set covers duplicates, all-equal values, distinct values and extremes.
"""

import random
import sys

MAX_N = 200000
MAX_LEN = 10**9


def choose_n(seed: int, rng: random.Random) -> int:
    if seed < 100:
        return rng.randint(1, 8)
    if seed < 1000:
        return rng.randint(20, 500)
    if seed < 10000:
        return rng.randint(2000, 50000)
    return MAX_N


def build(shape: int, n: int, rng: random.Random) -> list:
    if shape == 0:  # all equal -> exactly one line of output
        return [rng.randint(1, MAX_LEN)] * n
    if shape == 1:  # tiny values, lots of duplicates
        return [rng.randint(1, 3) for _ in range(n)]
    if shape == 2:  # distinct values -> one line of output per rod
        picked = rng.sample(range(1, MAX_LEN + 1), min(n, 100000))
        while len(picked) < n:
            picked.append(rng.randint(1, MAX_LEN))
        return picked
    if shape == 3:  # everything at the maximum length
        return [MAX_LEN] * n
    if shape == 4:  # everything at the minimum length except one huge rod
        vals = [1] * n
        vals[rng.randrange(n)] = MAX_LEN
        return vals
    return [rng.randint(1, MAX_LEN) for _ in range(n)]  # plain random


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    values = build(seed % 6, n, rng)
    rng.shuffle(values)
    sys.stdout.write(str(n) + "\n")
    sys.stdout.write(" ".join(map(str, values)) + "\n")


main()
