"""Orchard Routes -- reference solution.

Row-by-row dynamic programming over the grid. dp[j] holds the number of routes
from the northwest plot to the plot in the current row and column j, modulo
10^9 + 7. Within a row the recurrence dp[j] = dp[j] (arrive from the north)
plus dp[j-1] (arrive from the west) is exactly a running prefix sum over each
maximal run of open plots, so every row is processed with itertools.accumulate
between the tree plots. O(r * c) time, O(c) memory.
"""

import sys
from itertools import accumulate

MOD = 10**9 + 7
TREE = ord("#")


def main() -> None:
    data = sys.stdin.buffer.read().split()
    r = int(data[0])
    c = int(data[1])
    rows = data[2:2 + r]

    # First row: a plot is reachable while no tree has appeared to its west.
    dp = [0] * c
    run = 1
    first = rows[0]
    for j in range(c):
        if first[j] == TREE:
            run = 0
        dp[j] = run

    for i in range(1, r):
        pos = 0
        for seg in rows[i].split(b"#"):
            width = len(seg)
            if width:
                dp[pos:pos + width] = [
                    x % MOD for x in accumulate(dp[pos:pos + width])
                ]
            if pos + width < c:
                dp[pos + width] = 0
            pos += width + 1

    print(dp[c - 1])


if __name__ == "__main__":
    main()
