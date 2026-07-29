"""Reference solution for "Apple and Orange".

Count how many launched pieces of fruit land on the tarp, which covers the
inclusive interval [s, t] on the number line.
"""

import sys


def count_on_tarp(origin, offsets, s, t):
    """Return how many landing points origin + offset fall inside [s, t]."""
    total = 0
    for offset in offsets:
        landing = origin + offset
        if s <= landing <= t:
            total += 1
    return total


def main():
    tokens = sys.stdin.read().split()
    values = [int(token) for token in tokens]

    s = values[0]
    t = values[1]
    a = values[2]
    b = values[3]
    n = values[4]
    m = values[5]

    apple_offsets = values[6:6 + n]
    orange_offsets = values[6 + n:6 + n + m]

    apples = count_on_tarp(a, apple_offsets, s, t)
    oranges = count_on_tarp(b, orange_offsets, s, t)

    out = []
    out.append(str(apples))
    out.append(str(oranges))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
