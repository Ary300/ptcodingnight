"""Bell Schedule Gaps -- brute-force check.

Independent approach: mark every busy minute of the day in a list, then scan the list for
the longest run of unmarked minutes. Linear in the length of the day times the number of
commitments, so only for cross-checking the reference on small inputs.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    first_bell = int(tokens[1])
    last_bell = int(tokens[2])
    starts = [int(t) for t in tokens[3 : 3 + n]]
    ends = [int(t) for t in tokens[3 + n : 3 + 2 * n]]

    busy = [False] * (last_bell - first_bell)
    for l, r in zip(starts, ends):
        for minute in range(l, r):
            busy[minute - first_bell] = True

    best = 0
    run = 0
    for flag in busy:
        run = 0 if flag else run + 1
        best = max(best, run)
    sys.stdout.write(f"{best}\n")


if __name__ == "__main__":
    main()
