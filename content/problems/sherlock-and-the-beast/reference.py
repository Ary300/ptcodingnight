"""Sherlock and The Beast -- reference solution.

For a length n, the answer uses f fives and n - f threes with f % 3 == 0 and
(n - f) % 5 == 0. Among the legal splits, the one with the most fives is the
largest number (all candidates have the same length, and every 5 placed before
the 3s dominates). Scanning f downward from n in steps of 3 visits each residue
of (n - f) mod 5 within at most five steps, so each query is O(1) to decide and
O(n) to print.
"""

import sys


def best_fives(n: int) -> int:
    """Return the largest f with 0 <= f <= n, f % 3 == 0, (n - f) % 5 == 0, or -1."""
    f = n - (n % 3)
    while f >= 0:
        if (n - f) % 5 == 0:
            return f
        f -= 3
    return -1


def main() -> None:
    data = sys.stdin.read().split()
    t = int(data[0])
    out = []
    for i in range(1, t + 1):
        n = int(data[i])
        f = best_fives(n)
        if f < 0:
            out.append("-1")
        else:
            out.append("5" * f + "3" * (n - f))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
