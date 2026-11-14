"""Bell Schedule Gaps -- reference solution.

Sort the commitments by start minute and sweep once, keeping the furthest end seen so far.
Whenever the next commitment starts after that end, the minutes in between are free. The
stretch before the first commitment and the stretch after the last one count too.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    first_bell = int(tokens[1])
    last_bell = int(tokens[2])
    starts = [int(t) for t in tokens[3 : 3 + n]]
    ends = [int(t) for t in tokens[3 + n : 3 + 2 * n]]

    blocks = sorted(zip(starts, ends))

    covered_until = first_bell
    best = 0
    for start, end in blocks:
        if start > covered_until:
            best = max(best, start - covered_until)
        covered_until = max(covered_until, end)
    best = max(best, last_bell - covered_until)

    sys.stdout.write(f"{best}\n")


if __name__ == "__main__":
    main()
