"""Beautiful Pairs -- brute force.

Exhaustively enumerates every possible single change instead of reasoning
about it: for each value currently present in b and each different
replacement value in [1, 100], apply the change and recompute the matching
from scratch. The matching size depends only on the value multisets, so which
position holds a given value is irrelevant and enumerating (old value,
new value) covers every distinct change.

The matching itself is recomputed per candidate as the sum over values of
min(count_a, count_b'), with the counts rebuilt for each candidate. At most
100 * 99 candidates, each O(100), so this passes even the maximum test, but
it embodies none of the +1 / -1 case analysis the reference uses.
"""

import sys

MAX_VALUE = 100


def matching_size(count_a: list[int], count_b: list[int]) -> int:
    return sum(min(count_a[v], count_b[v]) for v in range(1, MAX_VALUE + 1))


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    b = [int(x) for x in data[1 + n:1 + 2 * n]]

    count_a = [0] * (MAX_VALUE + 1)
    count_b = [0] * (MAX_VALUE + 1)
    for value in a:
        count_a[value] += 1
    for value in b:
        count_b[value] += 1

    best = -1
    for old in range(1, MAX_VALUE + 1):
        if count_b[old] == 0:
            continue
        for new in range(1, MAX_VALUE + 1):
            if new == old:
                continue
            changed = list(count_b)
            changed[old] -= 1
            changed[new] += 1
            size = matching_size(count_a, changed)
            if size > best:
                best = size

    print(best)


if __name__ == "__main__":
    main()
