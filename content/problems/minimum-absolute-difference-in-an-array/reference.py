"""Minimum Absolute Difference in an Array -- reference solution.

Sort the array. In sorted order, the closest pair of values must be adjacent,
so one scan over consecutive elements finds the minimum absolute difference.
O(n log n).
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = sorted(int(x) for x in data[1:1 + n])

    best = values[1] - values[0]
    for i in range(2, n):
        gap = values[i] - values[i - 1]
        if gap < best:
            best = gap

    print(best)


if __name__ == "__main__":
    main()
