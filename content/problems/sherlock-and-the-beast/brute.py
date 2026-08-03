"""Sherlock and The Beast -- brute force.

Definition-literal: enumerate every string of length n over the digits {5, 3},
keep the ones whose digit counts satisfy both divisibility rules, and take the
maximum. All candidates share a length, so string max equals numeric max.
Exponential in n; usable only for tiny lengths, and guaranteed to blow any
time limit at the constraint ceiling.
"""

import sys
from itertools import product


def solve(n: int) -> str:
    best = None
    for digits in product("53", repeat=n):
        s = "".join(digits)
        if s.count("5") % 3 == 0 and s.count("3") % 5 == 0:
            if best is None or s > best:
                best = s
    return best if best is not None else "-1"


def main() -> None:
    data = sys.stdin.read().split()
    t = int(data[0])
    out = []
    for i in range(1, t + 1):
        out.append(solve(int(data[i])))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
