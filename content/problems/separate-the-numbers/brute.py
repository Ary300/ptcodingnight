"""Separate the Numbers -- brute force.

Definition-literal check: recursively enumerate every way to cut the tape into
tokens, keep only the cuts in which every token is a positive integer written
with no leading zero and each token equals the previous token plus one, and
require at least two tokens. Collect the first token of every surviving cut and
print the smallest. The consecutive-integer condition is checked as each token
is placed, exactly as the statement defines it; there is no natural asymptotic
gap between this and the reference for this task.
"""

import sys


def main() -> None:
    sys.setrecursionlimit(10000)
    s = sys.stdin.readline().strip()
    n = len(s)
    firsts: list[int] = []

    def extend(pos: int, prev: int | None, count: int, first: int | None) -> None:
        if pos == n:
            if count >= 2 and first is not None:
                firsts.append(first)
            return
        if s[pos] == "0":
            # Every token starting here is either "0" (not positive) or has a
            # leading zero, so no cut can continue from this position.
            return
        for end in range(pos + 1, n + 1):
            value = int(s[pos:end])
            if prev is not None and value != prev + 1:
                continue
            extend(end, value, count + 1, first if first is not None else value)

    extend(0, None, 0, None)

    if firsts:
        print(f"YES {min(firsts)}")
    else:
        print("NO")


if __name__ == "__main__":
    main()
