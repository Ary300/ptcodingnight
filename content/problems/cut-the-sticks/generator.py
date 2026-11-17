"""Random input generator for "Cut the sticks".

Usage: python3 generator.py <seed>

Deterministic per seed.  Small seeds produce small inputs; large seeds produce
inputs at the constraint ceiling.  The seed also selects a shape (seed % 6) so
that the generated set covers duplicates, all-equal values, distinct values and
extremes.

The ceiling is sized for a casual contest: n <= 1000 and lengths <= 10^6, so the
straightforward "simulate every pass" solution is fast and every value fits in a
32-bit int.

Which seed made which test (01 and 02 are the hand-written statement samples):

    03  seed 19     n = 1, a single tiny rod
    04  seed 9      every rod at the maximum length
    05  seed 7      tiny values, lots of duplicates
    06  seed 12     all equal
    07  seed 4      all length 1 except one maximum rod
    08  seed 500    distinct values, one line of output per rod
    09  seed 501    every rod at the maximum length
    10  seed 997    tiny values, lots of duplicates
    11  seed 5000   distinct values
    12  seed 7777   tiny values, lots of duplicates
    13  seed 10000  n at the ceiling, all 1 except one maximum rod
    14  seed 10002  n at the ceiling, all equal
    15  seed 10001  n at the ceiling, plain random
"""

import random
import sys

MAX_N = 1000
MAX_LEN = 10**6


def choose_n(seed: int, rng: random.Random) -> int:
    if seed < 100:
        return rng.randint(1, 8)
    if seed < 1000:
        return rng.randint(20, 200)
    if seed < 10000:
        return rng.randint(300, 700)
    return MAX_N


def build(shape: int, n: int, rng: random.Random) -> list:
    if shape == 0:  # all equal -> exactly one line of output
        return [rng.randint(1, MAX_LEN)] * n
    if shape == 1:  # tiny values, lots of duplicates
        return [rng.randint(1, 3) for _ in range(n)]
    if shape == 2:  # distinct values -> one line of output per rod
        return rng.sample(range(1, MAX_LEN + 1), n)
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
