"""Equalize the Array -- reference solution.

The elements kept must all share one value, so the best plan keeps every copy of
the most frequent value and deletes everything else: n minus the highest
frequency.
"""

import sys
from collections import Counter


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    counts = Counter(values)
    print(n - max(counts.values()))


if __name__ == "__main__":
    main()
