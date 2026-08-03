"""Counting Sort 2 -- reference solution.

Count how many times each value 0..99 occurs, then reconstruct the sorted list
by writing each value out as many times as it was counted. O(n + 100) time.
"""

import sys

MAX_VALUE = 99


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])

    counts = [0] * (MAX_VALUE + 1)
    for token in data[1:1 + n]:
        counts[int(token)] += 1

    pieces = [(str(value) + " ") * count for value, count in enumerate(counts) if count]
    sys.stdout.write("".join(pieces).rstrip() + "\n")


if __name__ == "__main__":
    main()
