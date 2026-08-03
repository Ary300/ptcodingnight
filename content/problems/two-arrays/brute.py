"""Permuting Two Arrays -- brute-force style checker.

A different approach from the reference: build the pairing one element at a
time. Take each value of A (largest first) and grab the smallest still-unused
value of B that lifts the pair to at least k; if some value of A finds no
usable partner, no permutation works. Correct by a standard exchange
argument. It leans on list.pop from the middle of a sorted list, so it is
O(n^2) data movement rather than a clean sort, but at these constraints it
still finishes comfortably.
"""

import bisect
import sys


def feasible(a: list[int], b: list[int], k: int) -> bool:
    remaining = sorted(b)
    for x in sorted(a, reverse=True):
        need = k - x
        i = bisect.bisect_left(remaining, need)
        if i == len(remaining):
            return False
        remaining.pop(i)
    return True


def main() -> None:
    data = sys.stdin.buffer.read().split()
    pos = 0
    q = int(data[pos])
    pos += 1
    out: list[str] = []
    for _ in range(q):
        n = int(data[pos])
        k = int(data[pos + 1])
        pos += 2
        a = [int(x) for x in data[pos:pos + n]]
        pos += n
        b = [int(x) for x in data[pos:pos + n]]
        pos += n
        out.append("YES" if feasible(a, b, k) else "NO")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
