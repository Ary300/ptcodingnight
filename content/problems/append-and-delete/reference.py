"""Append and Delete -- reference solution.

Let p be the length of the longest common prefix of s and t. Appends and deletes
only touch the end of the string, so the first p letters can stay and everything
after them in s has to go: the cheapest conversion deletes s down to that prefix
and appends the rest of t, costing needed = (|s| - p) + (|t| - p) operations.
The task asks for AT MOST k operations, so the answer is Yes exactly when
needed <= k.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    s, t, k = data[0], data[1], int(data[2])

    p = 0
    limit = min(len(s), len(t))
    while p < limit and s[p] == t[p]:
        p += 1

    needed = (len(s) - p) + (len(t) - p)
    print("Yes" if needed <= k else "No")


if __name__ == "__main__":
    main()
