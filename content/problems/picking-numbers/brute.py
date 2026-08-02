"""Picking Numbers -- brute-force checker.

For every candidate low value v in the full constraint range, count how many
list elements fall in {v, v+1} with two independent full scans of the list, and
keep the biggest total. No histogram, no cleverness: correctness is visible by
inspection. Used for stress-testing the reference; slower but still fine at the
constraint ceiling because values are bounded by 100.
"""

import sys

MAX_VALUE = 100


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    best = 0
    for v in range(1, MAX_VALUE + 1):
        size = values.count(v) + values.count(v + 1)
        if size > best:
            best = size
    print(best)


if __name__ == "__main__":
    main()
