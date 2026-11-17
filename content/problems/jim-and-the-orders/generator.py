"""Jim and the Orders -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny order lists; larger seeds push
n to the constraint ceiling of 1,000 orders. The seed also selects the shape of
the data (seed % 7) so the test set covers degenerate cases (a single order,
every finish time equal, finish times already sorted or exactly reversed, heavy
ties, both value bounds) and not just uniform noise.

Which seed made which test (tests 01-04 are written by hand: the two statement
examples, then a single (1, 1) order and a single (10^6, 10^6) order):

    05  seed 12   n = 144   shape 5, all (1, 1)
    06  seed 5    n = 25    shape 5, all (10^6, 10^6)
    07  seed 9    n = 81    shape 2, finish times strictly decreasing
    08  seed 10   n = 100   shape 3, finish times strictly increasing
    09  seed 8    n = 64    shape 1, one shared finish time
    10  seed 11   n = 121   shape 4, a handful of distinct finish times
    11  seed 13   n = 169   shape 6, one shared arrival time
    12  seed 7    n = 49    shape 0, uniform noise
    13  seed 21   n = 441   shape 0, uniform noise
    14  seed 25   n = 625   shape 4, a handful of distinct finish times
    15  seed 29   n = 841   shape 1, one shared finish time
    16  seed 30   n = 900   shape 2, finish times strictly decreasing
    17  seed 35   n = 1000  shape 0, uniform noise at the ceiling

Tests 13-17 were once seeds 70, 60, 92, 275 and 322 against a ceiling of
10^5 orders; the seeds above keep each test's shape at a classroom size.
"""

import random
import sys

MAX_N = 1000
MAX_T = 1000000
MAX_D = 1000000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 order, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def split_finish(finish: int, rng: random.Random) -> tuple[int, int]:
    """Pick a valid (t, d) with t + d == finish and both inside the bounds."""
    lo = max(1, finish - MAX_D)
    hi = min(MAX_T, finish - 1)
    t = rng.randint(lo, hi)
    return (t, finish - t)


def build_orders(seed: int, n: int, rng: random.Random) -> list[tuple[int, int]]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full range of both values.
        return [(rng.randint(1, MAX_T), rng.randint(1, MAX_D)) for _ in range(n)]

    if shape == 1:
        # Every order has the same finish time: the whole output is one tie.
        finish = rng.randint(2, MAX_T + 1)
        return [split_finish(finish, rng) for _ in range(n)]

    if shape == 2:
        # Finish times strictly decreasing: the answer is n .. 1.
        step = max(1, (MAX_T + MAX_D - 2) // max(1, n))
        orders = []
        finish = 2 + step * (n - 1)
        for _ in range(n):
            orders.append(split_finish(finish, rng))
            finish -= step
        return orders

    if shape == 3:
        # Finish times strictly increasing: the answer is 1 .. n.
        step = max(1, (MAX_T + MAX_D - 2) // max(1, n))
        orders = []
        finish = 2
        for _ in range(n):
            orders.append(split_finish(finish, rng))
            finish += step
        return orders

    if shape == 4:
        # Heavy ties: only a handful of distinct finish times.
        distinct = rng.randint(1, min(5, n))
        finishes = rng.sample(range(2, MAX_T + 2), distinct)
        return [split_finish(rng.choice(finishes), rng) for _ in range(n)]

    if shape == 5:
        # Everything pinned at a bound: all-minimum or all-maximum values.
        if seed % 2 == 0:
            return [(1, 1)] * n
        return [(MAX_T, MAX_D)] * n

    # shape == 6: same arrival time for all, only prep time separates them.
    t = rng.randint(1, MAX_T)
    return [(t, rng.randint(1, MAX_D)) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    orders = build_orders(seed, n, rng)
    assert len(orders) == n
    assert all(1 <= t <= MAX_T and 1 <= d <= MAX_D for t, d in orders)
    out = sys.stdout
    out.write(f"{n}\n")
    for t, d in orders:
        out.write(f"{t} {d}\n")


if __name__ == "__main__":
    main()
