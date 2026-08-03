"""Lonely Integer -- definition-literal solution.

Count how many times each value appears and print the value whose count is 1.
This reads the constraint text back at the input as directly as possible. The
task is a single pass either way, so there is no honestly slower variant with
a different complexity class; what makes this a useful cross-check is the
different mechanism (explicit counting instead of XOR cancellation).
"""

import sys
from collections import Counter


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    counts = Counter(values)
    for value, count in counts.items():
        if count == 1:
            print(value)
            return

    raise AssertionError("input violated the uniqueness guarantee")


if __name__ == "__main__":
    main()
