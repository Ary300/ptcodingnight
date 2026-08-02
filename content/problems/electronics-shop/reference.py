"""Electronics Shop -- reference solution.

Sort the drive prices, then for each keyboard binary search for the most
expensive drive that still fits in the remaining budget. Track the best
combined price seen across all keyboards; print -1 if no pair fits.
O((n + m) log m).
"""

import bisect
import sys


def main() -> None:
    data = sys.stdin.read().split()
    b, n, m = int(data[0]), int(data[1]), int(data[2])
    keyboards = [int(x) for x in data[3:3 + n]]
    drives = sorted(int(x) for x in data[3 + n:3 + n + m])

    best = -1
    cheapest_drive = drives[0]
    for k in keyboards:
        remaining = b - k
        if remaining < cheapest_drive:
            continue
        idx = bisect.bisect_right(drives, remaining) - 1
        total = k + drives[idx]
        if total > best:
            best = total

    print(best)


if __name__ == "__main__":
    main()
