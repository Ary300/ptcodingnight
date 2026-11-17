"""Append and Delete -- brute force.

Different mechanism from the reference: instead of computing the longest common
prefix and doing arithmetic on it, enumerate every plan of the form "press delete
d times first, then append the rest of t". After d deletes the string is
s[: len(s) - d]. The plan can finish only if that remainder is a prefix of t,
checked literally with str.startswith; its cost is d deletes plus the appends
that complete t. The answer is Yes when the cheapest such plan costs at most k.
Any plan that interleaves appends before a later delete wastes presses, so
these plans include an optimal one.

O(|s| * (|s| + |t|)) overall, versus the reference's single O(|s| + |t|) scan.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    s, t, k = data[0], data[1], int(data[2])

    best = None
    for d in range(len(s) + 1):
        remainder = s[: len(s) - d]
        if not t.startswith(remainder):
            continue
        cost = d + (len(t) - len(remainder))
        if best is None or cost < best:
            best = cost
    print("Yes" if best is not None and best <= k else "No")


if __name__ == "__main__":
    main()
