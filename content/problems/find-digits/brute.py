"""Find Digits -- definition-literal brute.

The task is O(digits of n) by definition, so there is no honestly slower approach.
This implementation differs mechanically from the reference: digits are extracted
arithmetically with repeated divmod by 10 (never via the string form), and
divisibility is checked as n // d * d == n instead of with the modulo operator.
"""

import sys


def digits_of(n: int) -> list[int]:
    ds = []
    while n > 0:
        n, r = divmod(n, 10)
        ds.append(r)
    return ds


def count_dividing_digits(n: int) -> int:
    total = 0
    for d in digits_of(n):
        if d == 0:
            continue
        if (n // d) * d == n:
            total += 1
    return total


def main() -> None:
    data = sys.stdin.read().split()
    t = int(data[0])
    for i in range(1, t + 1):
        print(count_dividing_digits(int(data[i])))


if __name__ == "__main__":
    main()
