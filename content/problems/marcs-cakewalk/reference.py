"""Marc's Cakewalk -- reference solution.

The doubling multiplier grows with the eating position, so the largest calorie
counts must take the smallest multipliers: sort descending and pay 2^i for the
i-th cupcake in that order. With n <= 15 and c <= 1000 the total is at most
1000 * (2^15 - 1) = 32,767,000, so it fits a 32-bit integer in every language.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    calories = [int(x) for x in data[1:1 + n]]

    calories.sort(reverse=True)
    total = sum(c << i for i, c in enumerate(calories))

    print(total)


if __name__ == "__main__":
    main()
