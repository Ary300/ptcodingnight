"""Compare the Triplets -- brute-force cross-check.

Deliberately avoids comparing the two ratings directly. For each position it
counts both ratings down in lockstep, one unit at a time; whichever rating
reaches zero first was the smaller one, and if they reach zero together the
position is a tie. Obviously correct, and O(100) per position instead of O(1).
"""

import sys


def duel(x: int, y: int) -> tuple[int, int]:
    """Return (first_point, second_point) for one position."""
    while x > 0 and y > 0:
        x -= 1
        y -= 1
    if x > 0:
        return (1, 0)
    if y > 0:
        return (0, 1)
    return (0, 0)


def main() -> None:
    data = sys.stdin.read().split()
    a = [int(v) for v in data[0:3]]
    b = [int(v) for v in data[3:6]]

    first = 0
    second = 0
    for i in range(3):
        p, q = duel(a[i], b[i])
        first += p
        second += q

    print(f"{first} {second}")


if __name__ == "__main__":
    main()
