"""Running Time of Algorithms -- brute force.

Simulate insertion sort exactly as the statement describes it and count
every single one-place shift. O(n^2), which comfortably fits these
constraints; it exists to cross-check the merge-sort reference.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]

    shifts = 0
    for i in range(1, n):
        value = a[i]
        j = i - 1
        while j >= 0 and a[j] > value:
            a[j + 1] = a[j]
            shifts += 1
            j -= 1
        a[j + 1] = value

    print(shifts)


if __name__ == "__main__":
    main()
