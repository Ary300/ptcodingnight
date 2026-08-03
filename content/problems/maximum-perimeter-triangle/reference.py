"""Maximum Perimeter Triangle -- reference solution.

Sort the rod lengths ascending and scan adjacent triples from the top. For a
fixed longest side L[i], the best partners are the two largest rods below it,
L[i-1] and L[i-2]; if even those fail the strict triangle inequality, no triple
with longest side L[i] can succeed. The first valid adjacent triple found while
scanning downward therefore maximises the perimeter, then the longest side,
then the second longest side. O(n log n).
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    lengths = sorted(int(x) for x in data[1:1 + n])

    for i in range(n - 1, 1, -1):
        a, b, c = lengths[i - 2], lengths[i - 1], lengths[i]
        if a + b > c:
            print(f"{a} {b} {c}")
            return

    print(-1)


if __name__ == "__main__":
    main()
