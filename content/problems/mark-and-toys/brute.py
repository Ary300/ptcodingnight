"""Mark and Toys -- definition-literal solution.

Simulates the shopping trip directly: while money remains, take the cheapest
toy still on the shelf and buy it if it is affordable. Selection goes through
a min-heap rather than a full sort, so this is a different mechanism from the
reference, though the same O(n log n) complexity: the E tier requires this
program to pass the largest test, which rules out a quadratic variant.
"""

import heapq
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    shelf = [int(x) for x in data[2:2 + n]]
    heapq.heapify(shelf)

    spent = 0
    bought = 0
    while shelf:
        cheapest = heapq.heappop(shelf)
        if spent + cheapest > k:
            break
        spent += cheapest
        bought += 1

    print(bought)


if __name__ == "__main__":
    main()
