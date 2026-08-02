"""Bill Division -- reference solution.

The fair charge is half the sum of every price except the unshared item at
position k (1-based). Print "Fair" when the actual charge b matches it, or the
overcharge b - fair otherwise.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    k = int(data[1])
    prices = [int(x) for x in data[2:2 + n]]
    b = int(data[2 + n])

    fair = (sum(prices) - prices[k - 1]) // 2

    if b == fair:
        print("Fair")
    else:
        print(b - fair)


if __name__ == "__main__":
    main()
