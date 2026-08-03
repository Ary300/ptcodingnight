"""Beautiful Triplets -- reference solution.

The sequence is strictly increasing, so every value is distinct and a triple is
determined by its middle value: a[j] is the middle of a qualifying triple exactly
when a[j] - d and a[j] + d both occur in the sequence. One pass with a hash set
of the values counts them in O(n).
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    d = int(data[1])
    values = [int(x) for x in data[2:2 + n]]

    present = set(values)
    count = sum(1 for v in values if (v - d) in present and (v + d) in present)

    print(count)


if __name__ == "__main__":
    main()
