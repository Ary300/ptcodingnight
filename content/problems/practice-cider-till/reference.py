"""The Cider Store Till -- reference solution.

Read the shift log and print the total of all sales followed by the largest
single sale, both in cents. One pass, tracking a running sum and a running max.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    sales = [int(x) for x in data[1:1 + n]]

    total = 0
    largest = sales[0]
    for amount in sales:
        total += amount
        if amount > largest:
            largest = amount

    print(f"{total} {largest}")


if __name__ == "__main__":
    main()
