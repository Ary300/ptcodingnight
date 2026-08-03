"""Counting Sort 1 -- reference solution.

Read the list, tally each value into a 100-slot frequency array in a single
pass, and print the whole array space-separated.
"""

import sys

RANGE = 100


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    counts = [0] * RANGE
    for token in data[1:1 + n]:
        counts[int(token)] += 1
    sys.stdout.write(" ".join(map(str, counts)))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
