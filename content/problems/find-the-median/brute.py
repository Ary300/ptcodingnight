"""Find the Median -- alternative check solution.

Deliberately avoids the reference's sort. The value range is bounded
(-10^6 .. 10^6), so build a histogram over the whole range and walk it
cumulatively: the median is the smallest value v such that at least
n // 2 + 1 elements are <= v. That is the definition of the middle
position applied directly to counts, with no comparison sort anywhere.

O(n + range) time, O(range) memory. Slower and hungrier than the
reference on small inputs, but obviously correct and structurally
independent of it, which is the point of this file.
"""

import sys

MIN_VALUE = -(10 ** 6)
MAX_VALUE = 10 ** 6


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    counts = [0] * (MAX_VALUE - MIN_VALUE + 1)
    for v in values:
        counts[v - MIN_VALUE] += 1

    need = n // 2 + 1  # elements at or before the middle position
    seen = 0
    for offset, count in enumerate(counts):
        seen += count
        if seen >= need:
            print(offset + MIN_VALUE)
            return

    raise AssertionError("histogram exhausted; input shorter than promised")


if __name__ == "__main__":
    main()
