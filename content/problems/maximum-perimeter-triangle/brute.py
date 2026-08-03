"""Maximum Perimeter Triangle -- brute force.

Definition-literal: enumerate every 3-rod combination, keep those that satisfy
the strict triangle inequality, and pick the maximum under the stated key
(perimeter, then longest side, then second longest side, then shortest side).
O(n^3), which is fine at n <= 100.
"""

import sys
from itertools import combinations


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    lengths = [int(x) for x in data[1:1 + n]]

    best: tuple[int, int, int, int] | None = None
    for tri in combinations(lengths, 3):
        a, b, c = sorted(tri)
        if a + b > c:
            key = (a + b + c, c, b, a)
            if best is None or key > best:
                best = key

    if best is None:
        print(-1)
    else:
        _, c, b, a = best
        print(f"{a} {b} {c}")


if __name__ == "__main__":
    main()
