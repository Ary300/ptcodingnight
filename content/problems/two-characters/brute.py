"""Two Characters -- brute-force check.

Definition-literal implementation: try every pair of distinct letters, walk
the string keeping only that pair, and test the alternation requirement one
adjacent position at a time. There is no natural asymptotically slower
algorithm for this task (the definition itself is "enumerate letter pairs"),
so this is the same complexity class as the reference but built directly from
the statement's wording with plain Python loops instead of str.translate and
substring search.
"""

import sys
from itertools import combinations


def main() -> None:
    data = sys.stdin.read().split()
    s = data[1] if len(data) > 1 else ""

    best = 0
    for a, b in combinations(sorted(set(s)), 2):
        kept = [ch for ch in s if ch == a or ch == b]
        alternates = True
        for k in range(len(kept) - 1):
            if kept[k] == kept[k + 1]:
                alternates = False
                break
        if alternates and a in kept and b in kept:
            best = max(best, len(kept))
    print(best)


if __name__ == "__main__":
    main()
