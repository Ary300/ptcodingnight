"""Find Digits -- reference solution.

For each of t integers, walk the decimal digits of n as characters and count the
occurrences of nonzero digits that divide n exactly.
"""

import sys


def count_dividing_digits(n: int) -> int:
    total = 0
    for ch in str(n):
        d = ord(ch) - ord("0")
        if d != 0 and n % d == 0:
            total += 1
    return total


def main() -> None:
    data = sys.stdin.read().split()
    t = int(data[0])
    out = []
    for i in range(1, t + 1):
        out.append(str(count_dividing_digits(int(data[i]))))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
