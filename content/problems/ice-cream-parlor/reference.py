"""Ice Cream Parlor -- reference solution.

For each trip, scan the price list once. A dictionary maps each cost already
seen to the smallest flavor index that has it; the first time the complement
of the current cost is present, that pair is the answer. The input guarantees
exactly one valid pair per trip, so the first hit is the only hit, and the
stored index is always the smaller of the two.
"""

import sys


def solve_trip(m: int, costs: list[int]) -> tuple[int, int]:
    first_index_of: dict[int, int] = {}
    for idx, cost in enumerate(costs, start=1):
        partner = first_index_of.get(m - cost)
        if partner is not None:
            return partner, idx
        if cost not in first_index_of:
            first_index_of[cost] = idx
    raise AssertionError("no pair sums to the budget; input violates the guarantee")


def main() -> None:
    data = sys.stdin.buffer.read().split()
    pos = 0
    t = int(data[pos])
    pos += 1
    lines = []
    for _ in range(t):
        m = int(data[pos])
        n = int(data[pos + 1])
        pos += 2
        costs = [int(x) for x in data[pos:pos + n]]
        pos += n
        i, j = solve_trip(m, costs)
        lines.append(f"{i} {j}")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
