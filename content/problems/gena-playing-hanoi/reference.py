"""Gena Playing Hanoi -- reference solution.

Four-rod Tower of Hanoi from an arbitrary legal position. A position is a
base-4 number with two bits per disc (disc i's rod lives at bits 2i..2i+1),
so the whole state space for n <= 10 fits in 4^10 = 1,048,576 integers.
The answer is the graph distance from the start state to state 0 (everything
on rod 1), found with a bidirectional breadth-first search: expand whichever
frontier is currently smaller, one full layer at a time, and stop at the
first layer in which the two searches meet.
"""

import sys


def neighbors(s: int, n: int) -> list[int]:
    """All states one legal move away from state s."""
    tops = [-1, -1, -1, -1]
    found = 0
    for d in range(n):
        r = (s >> (2 * d)) & 3
        if tops[r] < 0:
            tops[r] = d
            found += 1
            if found == 4:
                break
    out = []
    for a in range(4):
        da = tops[a]
        if da < 0:
            continue
        for b in range(4):
            if b == a:
                continue
            db = tops[b]
            if db < 0 or db > da:
                out.append(s + ((b - a) << (2 * da)))
    return out


def min_moves(start: int, n: int) -> int:
    goal = 0
    if start == goal:
        return 0

    dist_fwd: dict[int, int] = {start: 0}
    dist_bwd: dict[int, int] = {goal: 0}
    frontier_fwd = [start]
    frontier_bwd = [goal]

    while frontier_fwd and frontier_bwd:
        if len(frontier_fwd) <= len(frontier_bwd):
            frontier, mine, other = frontier_fwd, dist_fwd, dist_bwd
            expanding_fwd = True
        else:
            frontier, mine, other = frontier_bwd, dist_bwd, dist_fwd
            expanding_fwd = False

        next_layer = []
        best = -1
        for s in frontier:
            nd = mine[s] + 1
            for ns in neighbors(s, n):
                if ns in other:
                    cand = nd + other[ns]
                    if best < 0 or cand < best:
                        best = cand
                if ns not in mine:
                    mine[ns] = nd
                    next_layer.append(ns)
        if best >= 0:
            return best
        if expanding_fwd:
            frontier_fwd = next_layer
        else:
            frontier_bwd = next_layer

    raise AssertionError("every legal position can reach the goal")


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    rods = [int(x) for x in data[1:1 + n]]

    start = 0
    for d, rod in enumerate(rods):
        start |= (rod - 1) << (2 * d)

    print(min_moves(start, n))


if __name__ == "__main__":
    main()
