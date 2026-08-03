"""Find the Median -- reference solution.

Read the odd-length list, sort it, and print the element at index n // 2
(0-indexed), which is the middle position of the sorted order.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]
    values.sort()
    print(values[n // 2])


if __name__ == "__main__":
    main()
