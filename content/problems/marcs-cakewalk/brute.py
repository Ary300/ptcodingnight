"""Marc's Cakewalk -- brute-force checker.

For n <= 8 this enumerates every eating order and takes the true minimum, which
is the definition of the task and shares no reasoning with the reference's
greedy. That exhaustive mode is what the stress test exercises. For larger n
(the full constraint allows n = 40, where n! is unreachable) it falls back to
the most definition-literal polynomial method available: repeatedly eat the
most caloric cupcake remaining, without using a library sort.
"""

import sys
from itertools import permutations

EXHAUSTIVE_LIMIT = 8


def cost(order: tuple[int, ...]) -> int:
    return sum(c << i for i, c in enumerate(order))


def exhaustive(calories: list[int]) -> int:
    return min(cost(order) for order in permutations(calories))


def selection(calories: list[int]) -> int:
    remaining = list(calories)
    total = 0
    position = 0
    while remaining:
        biggest = 0
        for i in range(1, len(remaining)):
            if remaining[i] > remaining[biggest]:
                biggest = i
        total += remaining[biggest] << position
        position += 1
        remaining = remaining[:biggest] + remaining[biggest + 1:]
    return total


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    calories = [int(x) for x in data[1:1 + n]]

    if n <= EXHAUSTIVE_LIMIT:
        print(exhaustive(calories))
    else:
        print(selection(calories))


if __name__ == "__main__":
    main()
