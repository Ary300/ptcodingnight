"""Random input generator for 'Day of the Programmer'.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce small inputs; large seeds
produce inputs at the constraint ceiling.
"""

import random
import sys

MAX_T = 20000
MIN_YEAR = 1600
MAX_YEAR = 9999


def is_leap(year):
    if year % 400 == 0:
        return True
    if year % 100 == 0:
        return False
    return year % 4 == 0


def days_in_year(year):
    return 366 if is_leap(year) else 365


def pick_size(seed, rng):
    """Grow the query count with the seed, capped at the ceiling."""
    if seed <= 5:
        return rng.randint(1, 8)
    if seed <= 20:
        return rng.randint(50, 500)
    if seed <= 60:
        return rng.randint(2000, 8000)
    return MAX_T


def main():
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    t = pick_size(seed, rng)

    lines = [str(t)]
    for _ in range(t):
        year = rng.randint(MIN_YEAR, MAX_YEAR)
        # Half the queries ask for the club's own celebration day.
        if rng.random() < 0.5:
            k = 256
        else:
            k = rng.randint(1, days_in_year(year))
        lines.append("%d %d" % (year, k))

    sys.stdout.write("\n".join(lines) + "\n")


main()
