"""The Cider Store Till -- brute-force cross-check.

Different mechanism from the reference on both outputs:
- the largest sale is found by the definition, checking for each sale that no
  other sale in the log exceeds it (O(n^2));
- the total is accumulated by popping amounts off a work list one at a time.

At this problem's ceiling (n <= 1000) the quadratic scan is at most 10^6
comparisons, so the brute passes the maximum test comfortably.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    sales = [int(x) for x in data[1:1 + n]]

    largest = None
    for candidate in sales:
        if all(other <= candidate for other in sales):
            largest = candidate
            break
    assert largest is not None

    total = 0
    work = list(sales)
    while work:
        total += work.pop()

    print(f"{total} {largest}")


if __name__ == "__main__":
    main()
