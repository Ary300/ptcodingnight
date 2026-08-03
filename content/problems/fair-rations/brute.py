"""Fair Rations -- alternative solution by a different mechanism.

The task is O(n) by definition, so there is no honestly slow variant. Instead
of simulating handoffs, this reasons directly from what a handoff does: it
flips the parity of two adjacent people. The people with odd counts must
therefore be fixed in pairs, each pair joined by a chain of handoffs along the
line, and matching consecutive odd positions minimizes the total chain length.
Each handoff in a chain costs two donuts, so the answer is twice the sum of
the gaps between consecutively paired odd positions. Impossible exactly when
the number of odd positions is odd.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    counts = [int(x) for x in data[1:1 + n]]

    odd_positions = [i for i, c in enumerate(counts) if c % 2 == 1]

    if len(odd_positions) % 2 == 1:
        print("NO")
        return

    total = sum(
        odd_positions[k + 1] - odd_positions[k]
        for k in range(0, len(odd_positions), 2)
    )
    print(2 * total)


if __name__ == "__main__":
    main()
