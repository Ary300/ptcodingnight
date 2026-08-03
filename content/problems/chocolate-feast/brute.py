"""Chocolate Feast -- brute-force check.

Definition-literal simulation: spend the money one bar at a time, then
perform wrapper trades one at a time, exactly as the statement narrates
them. Same asymptotic order as the task itself (the task is O(n / c) by
definition), but a genuinely different mechanism from the reference's
bulk div/mod arithmetic, so a mistake in either is unlikely to hide in
the other.
"""

import sys


def main() -> None:
    n, c, m = (int(x) for x in sys.stdin.read().split())

    money = n
    bars = 0
    wrappers = 0
    while money >= c:
        money -= c
        bars += 1
        wrappers += 1

    while wrappers >= m:
        wrappers -= m
        bars += 1
        wrappers += 1

    print(bars)


if __name__ == "__main__":
    main()
