"""Priyanka and Toys -- reference solution.

Sort the weights, then sweep left to right: whenever a toy is heavier than the
current crate's ceiling, open a new crate based at that toy's weight, which
covers everything up to that weight plus four. Basing each new crate at the
lightest unpacked toy is optimal: any crate that holds that toy has a base
weight no larger, so its window reaches no further to the right.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    weights = sorted(int(x) for x in data[1:1 + n])

    crates = 0
    ceiling = -1
    for w in weights:
        if w > ceiling:
            crates += 1
            ceiling = w + 4
    print(crates)


if __name__ == "__main__":
    main()
