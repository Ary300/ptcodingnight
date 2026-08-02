"""Breaking the Records -- brute-force cross-check.

Different approach from the reference: for every game after the first,
recompute the maximum and minimum of the whole prefix from scratch and ask
whether this game strictly beats them. O(n^2), correct by inspection.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    scores = [int(x) for x in data[1:1 + n]]

    high_breaks = 0
    low_breaks = 0

    for i in range(1, n):
        prefix = scores[:i]
        if scores[i] > max(prefix):
            high_breaks += 1
        if scores[i] < min(prefix):
            low_breaks += 1

    print(f"{high_breaks} {low_breaks}")


if __name__ == "__main__":
    main()
