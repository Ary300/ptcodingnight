"""Maximizing XOR -- brute-force solution.

Definition-literal: try every pair (a, b) with l <= a <= b <= r and keep the
largest XOR seen. O((r - l + 1)^2), which is comfortable at r <= 1000.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    l, r = int(data[0]), int(data[1])
    best = 0
    for a in range(l, r + 1):
        for b in range(a, r + 1):
            if a ^ b > best:
                best = a ^ b
    print(best)


if __name__ == "__main__":
    main()
