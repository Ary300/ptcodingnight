"""Reference solution for "Sales by Match".

Count how many complete pairs of equal colour codes exist in the bin:
each code contributes floor(count / 2) pairs.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    codes = [int(token) for token in data[1:1 + n]]

    counts = {}
    for code in codes:
        counts[code] = counts.get(code, 0) + 1

    pairs = 0
    for count in counts.values():
        pairs += count // 2

    print(pairs)


if __name__ == "__main__":
    main()
