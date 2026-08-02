"""Counting Valleys -- brute-force checker. NOT shipped to the judge.

Obviously correct and deliberately slow: the elevation after step i is, by
definition, the number of 'U' characters in the first i steps minus the number
of 'D' characters. Recompute it from scratch for every step (O(n^2)) and count
the steps that are 'U' and land exactly on elevation zero, since each of those
closes exactly one valley.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    steps = data[1]
    assert len(steps) == n

    valleys = 0
    for i in range(1, n + 1):
        prefix = steps[:i]
        elevation = prefix.count("U") - prefix.count("D")
        if steps[i - 1] == "U" and elevation == 0:
            valleys += 1

    print(valleys)


if __name__ == "__main__":
    main()
