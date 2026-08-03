"""Counting Sort 2 -- brute solution.

Definition-literal check: hand the whole list to Python's built-in comparison
sort and print it. A genuinely different algorithm from the reference (which
counts occurrences), even though both are fast enough at this problem's size.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    values = [int(token) for token in data[1:1 + n]]
    sys.stdout.write(" ".join(str(v) for v in sorted(values)) + "\n")


if __name__ == "__main__":
    main()
