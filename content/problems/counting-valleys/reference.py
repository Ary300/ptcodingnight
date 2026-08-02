"""Counting Valleys -- reference solution.

Walk the step string once, tracking the current elevation. A valley finishes
exactly when a 'U' step brings the elevation back up to zero, so the answer is
the number of times that happens.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    steps = data[1]
    assert len(steps) == n

    elevation = 0
    valleys = 0
    for step in steps:
        if step == "U":
            elevation += 1
            if elevation == 0:
                valleys += 1
        else:
            elevation -= 1

    print(valleys)


if __name__ == "__main__":
    main()
