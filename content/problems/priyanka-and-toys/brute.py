"""Priyanka and Toys -- brute-force solution.

Simulates the packing directly on the set of distinct weights, with no sorting
and no sweep: repeatedly scan for the lightest toy still unpacked, open a crate
based at exactly that weight, and discard every weight that crate can hold.
Same exchange argument as the reference (a crate covering the lightest unpacked
toy can never reach further right than one based at it), but implemented as the
literal process rather than a sorted sweep. A truly assumption-free brute would
try every subset of base weights, which is exponential; the stress harness
covers that gap by exhaustively checking minimality on tiny inputs.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    remaining = {int(x) for x in data[1:1 + n]}

    crates = 0
    while remaining:
        lightest = min(remaining)
        crates += 1
        for v in range(lightest, lightest + 5):
            remaining.discard(v)
    print(crates)


if __name__ == "__main__":
    main()
