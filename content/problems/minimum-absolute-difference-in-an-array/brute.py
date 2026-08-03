"""Minimum Absolute Difference in an Array -- brute force.

Definition-literal: examine every pair (i, j) with i < j and take the smallest
|a_i - a_j|. O(n^2), which is fine at n <= 2000.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    best = abs(values[0] - values[1])
    for i in range(n):
        ai = values[i]
        for j in range(i + 1, n):
            diff = abs(ai - values[j])
            if diff < best:
                best = diff

    print(best)


if __name__ == "__main__":
    main()
