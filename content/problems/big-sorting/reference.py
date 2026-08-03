"""Big Sorting -- reference solution.

Keep every numeral as a byte string and sort with the key (digit count, digits).
For decimal numerals without leading zeros that key is exactly non-decreasing
numeric order, and it never materializes a big integer, so the run time is the
sort itself: O(total digits * log n) in the worst case.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    numerals = data[1:1 + n]
    numerals.sort(key=lambda s: (len(s), s))
    sys.stdout.buffer.write(b"\n".join(numerals) + b"\n")


if __name__ == "__main__":
    main()
