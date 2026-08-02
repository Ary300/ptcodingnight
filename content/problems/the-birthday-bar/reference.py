"""Subarray Division -- reference solution.

Slide a window of length m across the bar, maintaining the window sum in O(1)
per step, and count the positions where the sum equals d. O(n) total.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    squares = [int(x) for x in data[1:1 + n]]
    d = int(data[1 + n])
    m = int(data[2 + n])

    window = sum(squares[:m])
    count = 1 if window == d else 0
    for i in range(m, n):
        window += squares[i] - squares[i - m]
        if window == d:
            count += 1

    print(count)


if __name__ == "__main__":
    main()
