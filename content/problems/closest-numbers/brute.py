"""Closest Numbers -- brute-force checker.

Definition-literal: examine every unordered pair of readings in the original,
unsorted input, track the minimum absolute difference seen, and keep every pair
that achieves it. Unlike the reference it never relies on the fact that minimal
pairs are adjacent in sorted order; it only sorts the collected pairs at the
end to satisfy the output order. O(n^2), which the constraints permit.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    best = None
    pairs: list[tuple[int, int]] = []
    for i in range(n):
        vi = values[i]
        for j in range(i + 1, n):
            vj = values[j]
            diff = vi - vj if vi > vj else vj - vi
            if best is None or diff < best:
                best = diff
                pairs = [(min(vi, vj), max(vi, vj))]
            elif diff == best:
                pairs.append((min(vi, vj), max(vi, vj)))

    pairs.sort()
    print(" ".join(f"{a} {b}" for a, b in pairs))


if __name__ == "__main__":
    main()
