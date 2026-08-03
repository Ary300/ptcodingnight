"""Maximizing XOR -- reference solution.

For l <= a <= b <= r, the maximum of a XOR b is determined by the highest bit
at which l and r differ. Every bit above it is shared by all numbers in the
range, so it can never contribute; every bit at or below it can be made to
differ (the range crosses the boundary where that bit flips), so all of them
can contribute at once. The answer is therefore 2^(bit length of l XOR r) - 1,
which is 0 when l == r.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    l, r = int(data[0]), int(data[1])
    print((1 << (l ^ r).bit_length()) - 1)


if __name__ == "__main__":
    main()
