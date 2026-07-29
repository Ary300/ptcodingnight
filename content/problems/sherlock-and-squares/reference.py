"""Reference solution: count perfect squares in each inclusive range [a, b].

The count of perfect squares in [1, x] is floor(sqrt(x)), so the answer for
[a, b] is floor(sqrt(b)) - floor(sqrt(a - 1)).  math.isqrt is exact integer
square root, so there is no floating point rounding to worry about.
"""

import math
import sys


def count_squares(a: int, b: int) -> int:
    return math.isqrt(b) - math.isqrt(a - 1)


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    out = []
    pos = 1
    for _ in range(q):
        a = int(data[pos])
        b = int(data[pos + 1])
        pos += 2
        out.append(str(count_squares(a, b)))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
