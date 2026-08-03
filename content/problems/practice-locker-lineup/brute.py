"""Locker Lineup -- brute-force cross-check.

Different mechanism from the reference: for every adjacent window of two
plates, sort the window and call it a rise exactly when sorting left it
unchanged and the two values differ. On an E-tier problem this still runs in
linear time and must pass the maximum test; its value is that it derives the
answer through an independent route (sorting) rather than a direct comparison.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    plates = [int(x) for x in data[1:1 + n]]

    rises = 0
    for i in range(1, n):
        window = [plates[i - 1], plates[i]]
        if sorted(window) == window and window[0] != window[1]:
            rises += 1

    print(rises)


if __name__ == "__main__":
    main()
