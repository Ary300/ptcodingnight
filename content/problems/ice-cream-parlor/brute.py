"""Ice Cream Parlor -- brute force.

Checks every unordered pair of flavors and collects the ones whose costs sum
to the budget. Asserts the guarantee (exactly one such pair) instead of
trusting it, which also makes this the oracle for validating generated data.
O(n^2) per trip; hopeless at the constraint ceiling, by design.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    pos = 0
    t = int(data[pos])
    pos += 1
    for _ in range(t):
        m = int(data[pos])
        n = int(data[pos + 1])
        pos += 2
        costs = [int(x) for x in data[pos:pos + n]]
        pos += n
        pairs = [
            (i + 1, j + 1)
            for i in range(n)
            for j in range(i + 1, n)
            if costs[i] + costs[j] == m
        ]
        assert len(pairs) == 1, f"expected exactly one valid pair, found {len(pairs)}"
        print(pairs[0][0], pairs[0][1])


if __name__ == "__main__":
    main()
