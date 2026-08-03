"""Largest Permutation -- reference solution.

Greedy from the left. Position i (0-based) can hold at most n - i once the
prefix before it is settled, because the array is a permutation and the greedy
has already pinned n, n-1, ... into positions 0..i-1. So walk i upward: if
a[i] already holds n - i it costs nothing; otherwise spend one swap bringing
n - i in from wherever it sits. A pos[] array (value -> index), updated on
every swap, makes each step O(1), so the whole thing is O(n) regardless of k.

Correctness of the greedy was checked against an exhaustive search over all
swap sequences (brute.py) on 400 tiny random inputs; see the stress run.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]

    pos = [0] * (n + 1)
    for i, v in enumerate(a):
        pos[v] = i

    remaining = k
    for i in range(n):
        if remaining == 0:
            break
        want = n - i
        if a[i] == want:
            continue
        j = pos[want]
        pos[a[i]] = j
        pos[want] = i
        a[i], a[j] = a[j], a[i]
        remaining -= 1

    sys.stdout.write(" ".join(map(str, a)))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
