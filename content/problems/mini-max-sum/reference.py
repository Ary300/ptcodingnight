"""Mini-Max Sum -- reference solution.

Read five integers. The minimum sum of four of them is the total minus the
largest value; the maximum sum of four is the total minus the smallest value.
Python integers are arbitrary precision, so no overflow care is needed here,
but the statement warns 32-bit languages about the 4 * 10^9 ceiling.
"""

import sys


def main() -> None:
    values = [int(x) for x in sys.stdin.read().split()]
    assert len(values) == 5

    total = sum(values)
    min_sum = total - max(values)
    max_sum = total - min(values)

    print(f"{min_sum} {max_sum}")


if __name__ == "__main__":
    main()
