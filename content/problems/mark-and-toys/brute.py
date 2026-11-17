"""Mark and Toys -- definition-literal solution.

Simulates the shopping trip directly: while money remains, take the cheapest
toy still on the shelf and buy it if it is affordable. Selection goes through
a min-heap rather than a full sort, so this is a different mechanism from the
reference. With n <= 1000 a quadratic beginner solution (bubble sort, then buy
from the cheap end) also passes every test well inside the time limit.
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
