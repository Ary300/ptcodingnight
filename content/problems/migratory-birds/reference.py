"""Migratory Birds -- reference solution.

Read the sighting log, count how many times each species code appears, and
report the code with the highest count, breaking ties toward the smaller code.
"""

import sys

MAX_CODE = 50


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    codes = [int(x) for x in data[1:1 + n]]

    counts = [0] * (MAX_CODE + 1)
    for code in codes:
        counts[code] += 1

    best_code = 1
    best_count = -1
    for code in range(1, MAX_CODE + 1):
        if counts[code] > best_count:
            best_count = counts[code]
            best_code = code

    print(best_code)


if __name__ == "__main__":
    main()
