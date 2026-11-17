"""Input generator for 'Day of the Programmer'.

Usage: python3 generator.py <seed>
       python3 generator.py <case-name>

Deterministic per seed. Small seeds produce small inputs; large seeds
produce inputs at the constraint ceiling.

A case name produces one of the hand-shaped tests instead. Which argument
made which test:

    01, 02  samples, written by hand in statement.md
    03      hand-written: 1600 1 (earliest year, first day)
    04      hand-written: 9999 365 (latest year, last day of a common year)
    05      century-boundaries
    06      leap-day-366
    07      all-equal
    08      every-day
    09      year-sweep
    10      first-century
    11      seed 3
    12      seed 17
    13      seed 45
    14      seed 900
"""

import random
import sys

MAX_T = 1000
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
        return rng.randint(500, 900)
    return MAX_T


def random_queries(seed):
    rng = random.Random(seed)
    t = pick_size(seed, rng)
    queries = []
    for _ in range(t):
        year = rng.randint(MIN_YEAR, MAX_YEAR)
        # Half the queries ask for the club's own celebration day.
        if rng.random() < 0.5:
            k = 256
        else:
            k = rng.randint(1, days_in_year(year))
        queries.append((year, k))
    return queries


def century_boundaries():
    """Every century year: the days either side of a possible 29 February."""
    return [(year, k)
            for year in range(MIN_YEAR, MAX_YEAR + 1, 100)
            for k in (59, 60, 61, 256)]


def leap_day_366():
    """Day 366 of a leap year: every leap year 1600-2800, then every
    400-divisible year up to 9600, then the last leap year 9996."""
    early = [y for y in range(MIN_YEAR, 2801) if is_leap(y)]
    late = list(range(3200, 9601, 400)) + [9996]
    return [(year, 366) for year in early + late]


def all_equal():
    """The ceiling query count, every query identical."""
    return [(2024, 256)] * MAX_T


def every_day():
    """Every day of a leap year, then every day of a common year."""
    return ([(2024, k) for k in range(1, 367)]
            + [(2023, k) for k in range(1, 366)])


def year_sweep():
    """Day 256 of two full 400-year cycles plus the last 200 years."""
    years = list(range(MIN_YEAR, 2400)) + list(range(9800, MAX_YEAR + 1))
    return [(year, 256) for year in years]


def first_century():
    """1600-1699: the first day, the last day, 1 February and day 256."""
    return [(year, k)
            for year in range(MIN_YEAR, 1700)
            for k in (1, days_in_year(year), 32, 256)]


CASES = {
    "century-boundaries": century_boundaries,
    "leap-day-366": leap_day_366,
    "all-equal": all_equal,
    "every-day": every_day,
    "year-sweep": year_sweep,
    "first-century": first_century,
}


def main():
    arg = sys.argv[1]
    queries = CASES[arg]() if arg in CASES else random_queries(int(arg))

    lines = [str(len(queries))]
    lines.extend("%d %d" % (year, k) for year, k in queries)
    sys.stdout.write("\n".join(lines) + "\n")


main()
