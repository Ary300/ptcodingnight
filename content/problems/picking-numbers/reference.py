"""Picking Numbers -- reference solution.

Any valid selection of integers with pairwise difference at most 1 uses either a
single value v or exactly the two adjacent values v and v+1. So one histogram
pass suffices: the answer is the maximum of count[v] + count[v+1] over every
value v that occurs.
"""

import sys
from collections import Counter


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    counts = Counter(values)
    best = max(counts[v] + counts.get(v + 1, 0) for v in counts)
    print(best)


if __name__ == "__main__":
    main()
