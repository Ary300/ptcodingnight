"""Reference solution for 'Day of the Programmer'.

For each query (Y, K) print the calendar date of the K-th day of year Y
in DD.MM.YYYY form, using the Gregorian leap-year rule.
"""

import sys


def is_leap(year):
    """Gregorian leap-year rule."""
    if year % 400 == 0:
        return True
    if year % 100 == 0:
        return False
    return year % 4 == 0


def month_lengths(year):
    """Number of days in each month of `year`, January first."""
    february = 29 if is_leap(year) else 28
    return [31, february, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def nth_day_of_year(year, k):
    """Return (day, month) of the k-th day of `year`."""
    remaining = k
    for index, length in enumerate(month_lengths(year)):
        if remaining <= length:
            return remaining, index + 1
        remaining -= length
    raise ValueError("k is larger than the number of days in the year")


def main():
    data = sys.stdin.read().split()
    t = int(data[0])
    out = []
    pos = 1
    for _ in range(t):
        year = int(data[pos])
        k = int(data[pos + 1])
        pos += 2
        day, month = nth_day_of_year(year, k)
        out.append("%02d.%02d.%04d" % (day, month, year))
    sys.stdout.write("\n".join(out) + "\n")


main()
