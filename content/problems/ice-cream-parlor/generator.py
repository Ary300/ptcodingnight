"""Ice Cream Parlor -- input generator.

Usage:
  python3 generator.py <seed>                 a mixed set of trips
  python3 generator.py trip <shape> <n> <seed> one trip of one shape
  python3 generator.py trips <seed> <n1> <n2> ...  one trip per size, shapes drawn

Deterministic per arguments. In seed mode, small seeds produce a handful of
tiny trips; larger seeds grow the trip count and sizes toward the ceiling.
Every trip is constructed so that EXACTLY one pair of distinct flavors sums
to the budget: the answer pair is planted first, and each subsequent filler
cost blocks its own complement from ever being chosen, so no accidental
second pair can form. The trip shape (uniform, sorted, reversed,
duplicate-heavy, equal halves, pair at the ends, boundary values) is drawn
per trip so the test set is not just uniform noise.

Sizes are kept casual on purpose: at most 500 flavors in a trip and 2,500
over a whole input, and every cost at most 10^6, so the budget and any sum
of two costs fit comfortably in a 32-bit int and the obvious double loop
over all pairs finishes well inside the time limit.

Which arguments made which test (01 and 02 are the hand-written statement
samples, and 03 and 04 are written by hand; none of them is generated):

  03  hand-written: the smallest trip, two flavors of equal cost "1 1", m = 2
  04  hand-written: two flavors at the cost ceiling "1000000 1000000",
      m = 2 * 10^6, the largest budget the constraints allow
  05  trip uniform 500 5
  06  trip pair-last 500 6      the answer is the last two flavors
  07  trip pair-first 500 7     the answer is the first two flavors
  08  trip sorted 500 8
  09  trip reversed 500 9
  10  trip duplicates 500 10    costs drawn from 50 values, many repeats
  11  trips 11 24 37 24 17 33 9 24 3 25 41   ten small trips
  12  trip boundary 500 12      the answer is cost 1 plus cost 10^6
  13  32
  14  34
  15  36
  16  38
  17  40
  18  trips 18 500 500 500 500 150 100 60 40 25 15   ten trips, 2,390 flavors
"""

import random
import sys
from collections import Counter
from collections.abc import Callable

MAX_T = 10
MAX_N = 500
MAX_TOTAL_N = 2500
MAX_COST = 10 ** 6

SHAPES = (
    "uniform",
    "sorted",
    "reversed",
    "duplicates",
    "equal-halves",
    "pair-last",
    "pair-first",
    "boundary",
)


def count_budget_pairs(costs: list[int], m: int) -> int:
    """Number of unordered index pairs whose costs sum to m."""
    counts = Counter(costs)
    total = 0
    for value, k in counts.items():
        partner = m - value
        if partner < value:
            continue
        if partner == value:
            total += k * (k - 1) // 2
        else:
            total += k * counts.get(partner, 0)
    return total


def pick_fillers(
    count: int,
    sample: Callable[[], int],
    forbidden: set[int],
    m: int,
) -> list[int]:
    """Draw filler costs that can never complete a second budget pair.

    A candidate is rejected if it is currently blocked; once accepted, its
    complement (m - c) becomes blocked. Repeats of an accepted value stay
    legal (two copies of c only matter when 2c == m, and then c blocks
    itself), so the loop always terminates for the ranges used here.
    """
    fillers: list[int] = []
    blocked = set(forbidden)
    while len(fillers) < count:
        for _ in range(100000):
            c = sample()
            if c not in blocked:
                break
        else:
            raise AssertionError("filler value space exhausted")
        fillers.append(c)
        blocked.add(m - c)
    return fillers


def make_trip(rng: random.Random, n: int, shape: str) -> tuple[int, list[int]]:
    assert 2 <= n <= MAX_N
    assert shape in SHAPES

    dup_lo = rng.randint(1, 200)
    if shape == "equal-halves":
        a = rng.randint(1, MAX_COST)
        b = a
    elif shape == "boundary":
        a, b = 1, MAX_COST
    elif shape == "duplicates":
        a = rng.randint(dup_lo, dup_lo + 49)
        b = rng.randint(dup_lo, dup_lo + 49)
    else:
        a = rng.randint(1, MAX_COST)
        b = rng.randint(1, MAX_COST)
    m = a + b

    if shape == "duplicates":
        sample: Callable[[], int] = lambda: rng.randint(dup_lo, dup_lo + 49)
    elif shape == "boundary":
        def sample() -> int:
            if rng.random() < 0.5:
                return rng.randint(2, 10 ** 4)
            return rng.randint(MAX_COST - 10 ** 4, MAX_COST - 1)
    else:
        sample = lambda: rng.randint(1, MAX_COST)

    fillers = pick_fillers(n - 2, sample, {a, b}, m)

    if shape == "pair-last":
        rng.shuffle(fillers)
        costs = fillers + [a, b]
    elif shape == "pair-first":
        rng.shuffle(fillers)
        costs = [a, b] + fillers
    else:
        costs = fillers + [a, b]
        rng.shuffle(costs)
        if shape == "sorted":
            costs.sort()
        elif shape == "reversed":
            costs.sort(reverse=True)

    assert count_budget_pairs(costs, m) == 1
    assert all(1 <= c <= MAX_COST for c in costs)
    assert 2 <= m <= 2 * MAX_COST
    return m, costs


def write_input(out, trips: list[tuple[int, list[int]]]) -> None:
    assert 1 <= len(trips) <= MAX_T
    assert sum(len(costs) for _, costs in trips) <= MAX_TOTAL_N
    out.write(f"{len(trips)}\n")
    for m, costs in trips:
        out.write(f"{m}\n{len(costs)}\n")
        out.write(" ".join(str(c) for c in costs))
        out.write("\n")


def mixed_trips(rng: random.Random, seed: int) -> list[tuple[int, list[int]]]:
    scale = min(1.0, seed / 40)
    budget = max(4, int(MAX_TOTAL_N * scale * rng.uniform(0.6, 1.0)))
    t = rng.randint(1, MAX_T)

    trips: list[tuple[int, list[int]]] = []
    remaining = budget
    for i in range(t):
        trips_left_after = t - i - 1
        cap = min(MAX_N, remaining - 2 * trips_left_after)
        if cap < 2:
            break
        n = rng.randint(2, cap)
        remaining -= n
        shape = rng.choice(SHAPES)
        trips.append(make_trip(rng, n, shape))
    if not trips:
        trips.append(make_trip(rng, 2, "uniform"))
    return trips


def main() -> None:
    args = sys.argv[1:]
    if args[0] == "trip":
        shape, n, seed = args[1], int(args[2]), int(args[3])
        trips = [make_trip(random.Random(seed), n, shape)]
    elif args[0] == "trips":
        seed = int(args[1])
        rng = random.Random(seed)
        trips = [make_trip(rng, int(n), rng.choice(SHAPES)) for n in args[2:]]
    else:
        seed = int(args[0])
        trips = mixed_trips(random.Random(seed), seed)

    write_input(sys.stdout, trips)


if __name__ == "__main__":
    main()
