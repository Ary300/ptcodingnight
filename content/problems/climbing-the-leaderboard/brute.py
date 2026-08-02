"""Climbing the Leaderboard -- brute-force check.

Answers each query independently, straight from the definition: the rank of a
score is one more than the number of distinct leaderboard scores strictly
greater than it. That count comes from bisect on the ascending list of
distinct scores, so this stays fast enough to pass the E-tier limits while
sharing no code path with the reference's descending two-pointer walk.
"""

import bisect
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    board = [int(x) for x in data[1:1 + n]]
    m = int(data[1 + n])
    queries = [int(x) for x in data[2 + n:2 + n + m]]

    ascending = sorted(set(board))
    out = []
    for q in queries:
        greater = len(ascending) - bisect.bisect_right(ascending, q)
        out.append(greater + 1)

    sys.stdout.write("\n".join(map(str, out)) + "\n")


if __name__ == "__main__":
    main()
