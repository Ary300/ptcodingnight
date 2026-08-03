"""Fair Rations -- reference solution.

If the number of people holding an odd count is itself odd, no sequence of
handoffs works (each handoff flips the parity of exactly two people). Otherwise
sweep left to right: whenever person i holds an odd count, hand one donut to i
and one to i + 1. Each odd position must receive at least one donut and donuts
leave the tray in adjacent pairs, so the sweep is optimal. O(n).
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    counts = [int(x) for x in data[1:1 + n]]

    if sum(c % 2 for c in counts) % 2 == 1:
        print("NO")
        return

    handed = 0
    for i in range(n - 1):
        if counts[i] % 2 == 1:
            counts[i] += 1
            counts[i + 1] += 1
            handed += 2

    print(handed)


if __name__ == "__main__":
    main()
