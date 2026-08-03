"""Closest Numbers -- reference solution.

Sort the readings. Because all values are distinct, any pair achieving the
minimum absolute difference must be adjacent in sorted order (a value strictly
between the two would create a smaller gap). One pass over the sorted array
finds the minimum adjacent gap; a second pass emits every adjacent pair with
that gap, which is already in increasing order of the smaller value.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = sorted(int(x) for x in data[1:1 + n])

    min_gap = min(values[i + 1] - values[i] for i in range(n - 1))

    out: list[str] = []
    for i in range(n - 1):
        if values[i + 1] - values[i] == min_gap:
            out.append(str(values[i]))
            out.append(str(values[i + 1]))

    print(" ".join(out))


if __name__ == "__main__":
    main()
