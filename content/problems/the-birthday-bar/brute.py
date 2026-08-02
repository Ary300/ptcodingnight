"""Subarray Division -- brute-force checker.

For every starting position, re-sum the whole run of m squares from scratch.
O(n * m); obviously correct, used to cross-check the reference solution.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    squares = [int(x) for x in data[1:1 + n]]
    d = int(data[1 + n])
    m = int(data[2 + n])

    count = 0
    for start in range(n - m + 1):
        if sum(squares[start:start + m]) == d:
            count += 1

    print(count)


if __name__ == "__main__":
    main()
