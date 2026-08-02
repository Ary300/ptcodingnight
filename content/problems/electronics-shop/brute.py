"""Electronics Shop -- brute force.

Try every keyboard against every drive and keep the best total that fits
inside the budget. O(n * m); obviously correct, used to validate the
reference solution and small enough to pass at these constraints.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    b, n, m = int(data[0]), int(data[1]), int(data[2])
    keyboards = [int(x) for x in data[3:3 + n]]
    drives = [int(x) for x in data[3 + n:3 + n + m]]

    best = -1
    for k in keyboards:
        for d in drives:
            total = k + d
            if total <= b and total > best:
                best = total

    print(best)


if __name__ == "__main__":
    main()
