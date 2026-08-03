"""Append and Delete -- brute force.

Different mechanism from the reference: instead of computing the longest common
prefix and doing arithmetic on it, enumerate every plan of the form "press delete
d times first, then finish the job". After d deletes the string is
s[: max(0, |s| - d)] (deletes past empty burn presses and change nothing). The
plan can finish only if that remainder is a prefix of t, checked literally with
str.startswith; the leftover presses must cover the appends that complete t, with
any surplus burned in append-then-delete pairs (so the surplus must be even).
Enumerating d also covers the burn-everything case with no special branch: d can
overshoot the length of s and waste presses on the empty string. Deletes beyond
|s| only shift the surplus by one each, so d beyond |s| + 1 with an empty
remainder adds nothing new; capping d at |s| + |t| + 2 is safely past that point.

O(|s| * (|s| + |t|)) overall, versus the reference's single O(|s| + |t|) scan.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    s, t, k = data[0], data[1], int(data[2])

    cap = min(k, len(s) + len(t) + 2)
    for d in range(cap + 1):
        remainder = s[: max(0, len(s) - d)]
        if not t.startswith(remainder):
            continue
        left = k - d
        appends = len(t) - len(remainder)
        if left >= appends and (left - appends) % 2 == 0:
            print("Yes")
            return
    print("No")


if __name__ == "__main__":
    main()
