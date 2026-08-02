"""Mini-Max Sum -- brute-force checker.

Enumerate every 4-element combination of the five inputs and take the min and
max of their sums directly. Obviously correct; used only to cross-check the
reference solution.
"""

import sys
from itertools import combinations


def main() -> None:
    values = [int(x) for x in sys.stdin.read().split()]
    assert len(values) == 5

    sums = [sum(combo) for combo in combinations(values, 4)]

    print(f"{min(sums)} {max(sums)}")


if __name__ == "__main__":
    main()
