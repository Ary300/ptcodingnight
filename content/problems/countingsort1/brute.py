"""Counting Sort 1 -- brute-force cross-check.

Definition-literal implementation: for each value v from 0 to 99, rescan the
entire list and count how many entries equal v. O(100 * n) instead of one
pass, which is the most direct reading of "for every value, count how many
times it occurs".
"""

import sys

RANGE = 100


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]
    counts = [values.count(v) for v in range(RANGE)]
    print(" ".join(str(c) for c in counts))


if __name__ == "__main__":
    main()
