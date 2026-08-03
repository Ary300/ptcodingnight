"""Chocolate Feast -- reference solution.

Buy floor(n / c) bars outright, then repeatedly trade wrappers in bulk:
every m wrappers become one bar, and each new bar contributes one wrapper
back. Uses div/mod per round, so the round count is logarithmic.
"""

import sys


def main() -> None:
    n, c, m = (int(x) for x in sys.stdin.read().split())

    bars = n // c
    wrappers = bars
    while wrappers >= m:
        traded = wrappers // m
        bars += traded
        wrappers = wrappers % m + traded

    print(bars)


if __name__ == "__main__":
    main()
