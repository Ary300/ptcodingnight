"""Climbing the Leaderboard -- reference solution.

Dense ranking: a score's rank is one more than the number of distinct
leaderboard scores strictly greater than it.

The distinct leaderboard scores are kept in descending order and the player's
scores arrive in non-decreasing order, so a single pointer walks up the board
as the queries climb. Total work is O(n log n + m).
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    board = [int(x) for x in data[1:1 + n]]
    m = int(data[1 + n])
    queries = [int(x) for x in data[2 + n:2 + n + m]]

    ranked = sorted(set(board), reverse=True)

    # i points at the lowest distinct score the current query has NOT reached.
    i = len(ranked) - 1
    out = []
    for q in queries:
        while i >= 0 and q >= ranked[i]:
            i -= 1
        # Scores ranked[0..i] are strictly greater than q, so rank is i + 2.
        out.append(i + 2)

    sys.stdout.write("\n".join(map(str, out)) + "\n")


if __name__ == "__main__":
    main()
