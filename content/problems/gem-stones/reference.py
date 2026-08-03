"""Gemstones -- reference solution.

Intersect the sets of distinct letters of all n strings and print the size of
the intersection.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    rocks = data[1:1 + n]

    common = set(rocks[0])
    for rock in rocks[1:]:
        common &= set(rock)

    print(len(common))


if __name__ == "__main__":
    main()
