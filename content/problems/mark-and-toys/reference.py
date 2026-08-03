"""Mark and Toys -- reference solution.

Sort the prices ascending and buy toys from the cheap end until the next one
would push the running total past the budget. The count at that point is the
maximum: swapping any bought toy for an unbought one never lowers the total.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    prices = sorted(int(x) for x in data[2:2 + n])

    total = 0
    count = 0
    for price in prices:
        if total + price > k:
            break
        total += price
        count += 1

    print(count)


if __name__ == "__main__":
    main()
