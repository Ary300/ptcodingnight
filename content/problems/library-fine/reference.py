"""Library Fine -- reference solution.

Compare (year, month, day) tuples. On time means zero; otherwise charge only
the coarsest unit that is late: a later year is a flat 10000, a later month in
the same year is 500 per month, a later day in the same month is 15 per day.
"""

import sys

DAY_RATE = 15
MONTH_RATE = 500
YEAR_FLAT = 10000


def main() -> None:
    data = sys.stdin.read().split()
    d_r, m_r, y_r = int(data[0]), int(data[1]), int(data[2])
    d_e, m_e, y_e = int(data[3]), int(data[4]), int(data[5])

    if (y_r, m_r, d_r) <= (y_e, m_e, d_e):
        fine = 0
    elif y_r > y_e:
        fine = YEAR_FLAT
    elif m_r > m_e:
        fine = MONTH_RATE * (m_r - m_e)
    else:
        fine = DAY_RATE * (d_r - d_e)

    print(fine)


if __name__ == "__main__":
    main()
