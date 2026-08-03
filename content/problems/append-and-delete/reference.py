"""Append and Delete -- reference solution.

Let p be the length of the longest common prefix of s and t. The cheapest honest
conversion deletes s down to that prefix and appends the rest of t, costing
needed = (|s| - p) + (|t| - p) operations. Spare operations can only be burned in
pairs (append a letter, delete it), so k works when k >= needed and k - needed is
even. The one exception is k >= |s| + |t|: delete everything, burn any number of
extra presses on the empty string (a delete on the empty string counts but does
nothing), then type t from scratch, so parity no longer matters.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    s, t, k = data[0], data[1], int(data[2])

    if k >= len(s) + len(t):
        print("Yes")
        return

    p = 0
    limit = min(len(s), len(t))
    while p < limit and s[p] == t[p]:
        p += 1

    needed = (len(s) - p) + (len(t) - p)
    print("Yes" if k >= needed and (k - needed) % 2 == 0 else "No")


if __name__ == "__main__":
    main()
