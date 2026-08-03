"""ACM ICPC Team -- brute-force cross-check.

Definition-literal and mechanism-different from the reference: each checklist
becomes the SET of topic indices the student knows, each pair's coverage is the
size of the set union, and every pair's coverage is materialized into a list
before taking max() and count(). Same O(n^2) pair loop as any approach to this
task, but no bitmasks and no incremental best-tracking.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    known = [
        {j for j, ch in enumerate(s) if ch == "1"}
        for s in data[2:2 + n]
    ]

    coverages = [
        len(known[i] | known[j])
        for i in range(n)
        for j in range(i + 1, n)
    ]

    best = max(coverages)
    print(best)
    print(coverages.count(best))


if __name__ == "__main__":
    main()
