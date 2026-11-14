"""Mini-Max Sum -- reference solution.

Read five integers. The minimum sum of four of them is the total minus the
largest value; the maximum sum of four is the total minus the smallest value.
With every value at most 10^8, the largest sum of four is 4 * 10^8 and the
full total is 5 * 10^8, so everything fits a 32-bit integer in every language.
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
