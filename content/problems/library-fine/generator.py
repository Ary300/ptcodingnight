"""Library Fine -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed selects a shape so the test set covers every
row of the fine table and the classic traps (return day later but month
earlier, one calendar day late across a year boundary, exact-match dates,
both constraint corners) rather than just uniform noise.
"""

import random
import sys

MAX_DAY = 31
MAX_MONTH = 12
MAX_YEAR = 3000


def random_date(rng: random.Random) -> tuple[int, int, int]:
    return (
        rng.randint(1, MAX_DAY),
        rng.randint(1, MAX_MONTH),
        rng.randint(1, MAX_YEAR),
    )


def build_case(seed: int, rng: random.Random) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    shape = seed % 10

    if shape == 0:
        # Two fully random dates.
        return random_date(rng), random_date(rng)

    if shape == 1:
        # Returned exactly on the due date.
        date = random_date(rng)
        return date, date

    if shape == 2:
        # Same year and month, late by days.
        m, y = rng.randint(1, MAX_MONTH), rng.randint(1, MAX_YEAR)
        d_e = rng.randint(1, MAX_DAY - 1)
        d_r = rng.randint(d_e + 1, MAX_DAY)
        return (d_r, m, y), (d_e, m, y)

    if shape == 3:
        # Same year, late by months; days are noise.
        y = rng.randint(1, MAX_YEAR)
        m_e = rng.randint(1, MAX_MONTH - 1)
        m_r = rng.randint(m_e + 1, MAX_MONTH)
        return (rng.randint(1, MAX_DAY), m_r, y), (rng.randint(1, MAX_DAY), m_e, y)

    if shape == 4:
        # Late by years; month and day are noise.
        y_e = rng.randint(1, MAX_YEAR - 1)
        y_r = rng.randint(y_e + 1, MAX_YEAR)
        return (rng.randint(1, MAX_DAY), rng.randint(1, MAX_MONTH), y_r), (
            rng.randint(1, MAX_DAY),
            rng.randint(1, MAX_MONTH),
            y_e,
        )

    if shape == 5:
        # Trap: return day later than due day, but an earlier month. Fine is 0.
        y = rng.randint(1, MAX_YEAR)
        m_r = rng.randint(1, MAX_MONTH - 1)
        m_e = rng.randint(m_r + 1, MAX_MONTH)
        d_e = rng.randint(1, MAX_DAY - 1)
        d_r = rng.randint(d_e + 1, MAX_DAY)
        return (d_r, m_r, y), (d_e, m_e, y)

    if shape == 6:
        # Trap: one calendar day late across a year boundary, flat 10000.
        y_e = rng.randint(1, MAX_YEAR - 1)
        return (1, 1, y_e + 1), (MAX_DAY, MAX_MONTH, y_e)

    if shape == 7:
        # Returned early by a year or more; month and day are noise.
        y_r = rng.randint(1, MAX_YEAR - 1)
        y_e = rng.randint(y_r + 1, MAX_YEAR)
        return (rng.randint(1, MAX_DAY), rng.randint(1, MAX_MONTH), y_r), (
            rng.randint(1, MAX_DAY),
            rng.randint(1, MAX_MONTH),
            y_e,
        )

    if shape == 8:
        # Constraint corners: both extremes, in seed-chosen order.
        low = (1, 1, 1)
        high = (MAX_DAY, MAX_MONTH, MAX_YEAR)
        return (high, low) if (seed // 10) % 2 == 0 else (low, high)

    # shape == 9: same year, month, and adjacent or equal days near a bound.
    m, y = rng.randint(1, MAX_MONTH), rng.randint(1, MAX_YEAR)
    d_e = rng.choice([1, MAX_DAY - 1, rng.randint(1, MAX_DAY)])
    d_r = min(MAX_DAY, d_e + rng.choice([0, 1]))
    return (d_r, m, y), (d_e, m, y)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    returned, due = build_case(seed, rng)
    for date in (returned, due):
        assert 1 <= date[0] <= MAX_DAY
        assert 1 <= date[1] <= MAX_MONTH
        assert 1 <= date[2] <= MAX_YEAR
    out = sys.stdout
    out.write(f"{returned[0]} {returned[1]} {returned[2]}\n")
    out.write(f"{due[0]} {due[1]} {due[2]}\n")


if __name__ == "__main__":
    main()
