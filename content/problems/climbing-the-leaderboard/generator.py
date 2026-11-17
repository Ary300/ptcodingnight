"""Climbing the Leaderboard -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny boards; seeds of 32 and up
reach the size cap of 1,000 scores on the board and 1,000 queries. The seed
also selects a shape so the test set covers degenerate cases (a one-score
board, an all-equal board, a board with every score distinct, queries that all
miss or all clear the board, boundary values 0 and the score cap) and not just
uniform noise. The board is always emitted in non-increasing order and the
queries in non-decreasing order, exactly as the statement guarantees.

Sizes are deliberately moderate for a casual contest: the largest test is
about 13 KB, and a student who recounts the distinct scores for every query
(O(n * m), one million steps) still finishes well inside the time limit.
Generated scores stay at or below 10^6; the statement's 10^9 ceiling is
exercised by the hand-written tests 04 and 09.

Which seed made which test (tests 01-11 are hand-written):

    12  seed 10   shape 2, every score distinct, n = 86
    13  seed 27   shape 3, heavy duplication
    14  seed 33   shape 1, one score repeated across the whole board
    15  seed 36   shape 4, queries that often land exactly on board scores
    16  seed 38   shape 6, full board, a handful of queries
    17  seed 39   shape 7, tiny board, a flood of queries
    18  seed 106  shape 2, every score distinct, n = 863 and m = 1,000
"""

import random
import sys

MAX_N = 1000
MAX_M = 1000
MAX_SCORE = 10**6


def sizes(seed: int, rng: random.Random) -> tuple[int, int]:
    base = max(1, min(MAX_N, seed * seed))
    shape = seed % 8
    if shape == 6:
        # Huge board, a handful of queries.
        return base, rng.randint(1, 10)
    if shape == 7:
        # Tiny board, a flood of queries.
        return rng.randint(1, 10), min(MAX_M, base)
    n = max(1, rng.randint(base // 2, base))
    m = max(1, rng.randint(base // 2, base))
    return n, min(MAX_M, m)


def build_board(shape: int, n: int, rng: random.Random) -> list[int]:
    if shape in (1,):
        # Every leaderboard entry is the same score.
        return [rng.randint(0, MAX_SCORE)] * n
    if shape in (2,):
        # Every score distinct: the worst case for dense ranking.
        top = rng.randint(n, MAX_SCORE)
        step_room = top // n
        board = []
        cur = top
        for _ in range(n):
            board.append(cur)
            cur -= rng.randint(1, max(1, min(step_room, 3)))
            cur = max(cur, 0)
        return sorted(board, reverse=True)
    if shape in (3,):
        # Heavy duplication: only a few distinct values.
        distinct = rng.sample(range(0, MAX_SCORE + 1), min(n, rng.randint(1, 8)))
        return sorted((rng.choice(distinct) for _ in range(n)), reverse=True)
    # Default: uniform noise, occasionally pinned to the boundary values.
    board = [rng.randint(0, MAX_SCORE) for _ in range(n)]
    if n >= 2 and rng.random() < 0.5:
        board[0] = MAX_SCORE
        board[1] = 0
    return sorted(board, reverse=True)


def build_queries(shape: int, m: int, board: list[int], rng: random.Random) -> list[int]:
    lo, hi = board[-1], board[0]
    if shape == 4:
        # Queries that frequently hit board values exactly.
        picks = [rng.choice(board) for _ in range(m)]
        return sorted(rng.randint(0, MAX_SCORE) if rng.random() < 0.2 else p for p in picks)
    if shape == 5:
        # Queries entirely outside the board's range, half below, half above.
        below = [rng.randint(0, lo) for _ in range(m // 2)] if lo > 0 else []
        above = [rng.randint(hi, MAX_SCORE) for _ in range(m - len(below))]
        return sorted(below + above)
    return sorted(rng.randint(0, MAX_SCORE) for _ in range(m))


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    shape = seed % 8
    n, m = sizes(seed, rng)
    board = build_board(shape, n, rng)
    queries = build_queries(shape, m, board, rng)

    assert len(board) == n and len(queries) == m
    assert all(board[i] >= board[i + 1] for i in range(n - 1))
    assert all(queries[j] <= queries[j + 1] for j in range(m - 1))
    assert all(0 <= x <= MAX_SCORE for x in board + queries)

    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(map(str, board)))
    out.write(f"\n{m}\n")
    out.write(" ".join(map(str, queries)))
    out.write("\n")


if __name__ == "__main__":
    main()
