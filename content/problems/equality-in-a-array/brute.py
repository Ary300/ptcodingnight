"""Equalize the Array -- definition-literal brute force.

For every candidate value that could be the one left standing, count how many
elements are NOT that value (each of those must be deleted), and take the
minimum over all candidates. Same O(n * distinct) shape as the definition of
the task; no frequency table, no single-pass trick.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    best = min(n - values.count(candidate) for candidate in set(values))
    print(best)


if __name__ == "__main__":
    main()
