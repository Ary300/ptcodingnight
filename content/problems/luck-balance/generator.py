"""Luck Balance -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny schedules; large seeds push
n to the constraint ceiling. The seed also selects the shape of the schedule
so the test set covers degenerate cases (everything important with k = 0,
everything important with k = n, nothing important, all luck values equal,
important lucks pre-sorted both ways, heavy duplicates) and not just uniform
noise.

Tests 01-14 are hand-written (01 and 02 are the statement's samples). The
generated tests and the seeds that produced them:

    15  seed 24   n = 576,  uniform noise, k below the important count (shape 0)
    16  seed 105  n = 1000, everything important, k = 0 (shape 1)
    17  seed 71   n = 1000, heavy duplicates from five luck values, k below
                  the important count so ties decide the cut (shape 7)
    18  seed 40   n = 1000, uniform noise, k above the important count so
                  every important contest is lost (shape 0)

The ceiling is kept small on purpose: n <= 1000 and luck <= 10^4 keep every
balance and every partial sum under 10^7, well inside a 32-bit int.
"""

import random
import sys

MAX_N = 1000
MAX_LUCK = 10000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 contest, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_schedule(
    seed: int, n: int, rng: random.Random
) -> tuple[int, list[tuple[int, int]]]:
    shape = seed % 8

    if shape == 0:
        # Uniform noise: random lucks, random flags, random k.
        contests = [
            (rng.randint(1, MAX_LUCK), rng.randint(0, 1)) for _ in range(n)
        ]
        return rng.randint(0, n), contests

    if shape == 1:
        # Everything important and no losses allowed: forced negative answer.
        return 0, [(rng.randint(1, MAX_LUCK), 1) for _ in range(n)]

    if shape == 2:
        # Everything important and every loss allowed: throw the season.
        return n, [(rng.randint(1, MAX_LUCK), 1) for _ in range(n)]

    if shape == 3:
        # Nothing important: k is irrelevant.
        contests = [(rng.randint(1, MAX_LUCK), 0) for _ in range(n)]
        return rng.randint(0, n), contests

    if shape == 4:
        # All luck values equal: only the flags and k matter.
        luck = rng.randint(1, MAX_LUCK)
        contests = [(luck, rng.randint(0, 1)) for _ in range(n)]
        return rng.randint(0, n), contests

    if shape == 5:
        # Important contests arrive in ascending luck order.
        contests = [(min(i + 1, MAX_LUCK), 1) for i in range(n)]
        return rng.randint(0, n), contests

    if shape == 6:
        # Important contests arrive in descending luck order.
        contests = [(max(n - i, 1), 1) for i in range(n)]
        return rng.randint(0, n), contests

    # shape == 7: heavy duplicates drawn from a handful of luck values.
    pool = [rng.randint(1, MAX_LUCK) for _ in range(min(5, n))]
    contests = [(rng.choice(pool), rng.randint(0, 1)) for _ in range(n)]
    return rng.randint(0, n), contests


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    k, contests = build_schedule(seed, n, rng)

    assert len(contests) == n
    assert 0 <= k <= n
    assert all(1 <= luck <= MAX_LUCK for luck, _ in contests)
    assert all(flag in (0, 1) for _, flag in contests)

    out = sys.stdout
    out.write(f"{n} {k}\n")
    for luck, flag in contests:
        out.write(f"{luck} {flag}\n")


if __name__ == "__main__":
    main()
