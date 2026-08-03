"""The Coding Night Switchyard -- brute force, definition-literal.

Enumerates EVERY achievable departure order by depth-first search over the two
legal moves at each state: advance the next inbound car into the siding, or
release the siding's top car. "Rolls straight through" is the composition of
the two, so the search covers every plan the statement allows. The verdict is
decided by literal membership of the identity order in the achievable set, and
the second line is the literal minimum of that set -- neither reuses the
reference's greedy or its suffix-minimum insight.

Exponential in n (the achievable set has Catalan-number size). Intended for the
stress harness and tiny inputs only; it can never pass the max test and is not
meant to.
"""

import sys


def main() -> None:
    sys.setrecursionlimit(10000)
    data = sys.stdin.read().split()
    n = int(data[0])
    cars = [int(x) for x in data[1 : 1 + n]]

    achievable: set[tuple[int, ...]] = set()

    def explore(i: int, siding: list[int], out: list[int]) -> None:
        if i == n and not siding:
            achievable.add(tuple(out))
            return
        if i < n:
            siding.append(cars[i])
            explore(i + 1, siding, out)
            siding.pop()
        if siding:
            top = siding.pop()
            out.append(top)
            explore(i, siding, out)
            out.pop()
            siding.append(top)

    explore(0, [], [])

    identity = tuple(range(1, n + 1))
    best = min(achievable)
    print("ON TIME" if identity in achievable else "DELAYED")
    print(" ".join(str(car) for car in best))


if __name__ == "__main__":
    main()
