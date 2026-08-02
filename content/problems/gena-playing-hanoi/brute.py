"""Gena Playing Hanoi -- brute-force checker.

Plain unidirectional breadth-first search over positions represented as a
tuple of rod numbers, one per disc. Obviously correct, makes no attempt to
be fast: state hashing on tuples, move generation by rescanning the tuple.
Fine for small n, hopeless at n = 10 within a contest time limit.
"""

import sys
from collections import deque


def legal_moves(state: tuple[int, ...]) -> list[tuple[int, ...]]:
    n = len(state)
    # Top disc of each rod = the smallest disc sitting on it.
    tops: dict[int, int] = {}
    for disc in range(n):
        rod = state[disc]
        if rod not in tops:
            tops[rod] = disc

    result = []
    for src, disc in tops.items():
        for dst in (1, 2, 3, 4):
            if dst == src:
                continue
            if dst in tops and tops[dst] < disc:
                continue
            moved = list(state)
            moved[disc] = dst
            result.append(tuple(moved))
    return result


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    start = tuple(int(x) for x in data[1:1 + n])
    goal = tuple([1] * n)

    seen = {start: 0}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        if state == goal:
            print(seen[state])
            return
        for nxt in legal_moves(state):
            if nxt not in seen:
                seen[nxt] = seen[state] + 1
                queue.append(nxt)

    raise AssertionError("every legal position can reach the goal")


if __name__ == "__main__":
    main()
