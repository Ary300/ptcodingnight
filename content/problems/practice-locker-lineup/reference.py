"""Locker Lineup -- reference solution.

Single pass over the plate numbers in corridor order, counting every position
whose value is strictly greater than the value immediately before it.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    plates = [int(x) for x in data[1:1 + n]]

    rises = 0
    for i in range(1, n):
        if plates[i] > plates[i - 1]:
            rises += 1

    print(rises)


if __name__ == "__main__":
    main()
