"""Staircase -- reference solution.

Row i (1-based) of a height-n staircase is n - i spaces followed by i hash
marks. Build every row directly and emit them joined by newlines.
"""

import sys


def main() -> None:
    n = int(sys.stdin.read().split()[0])
    rows = [" " * (n - i) + "#" * i for i in range(1, n + 1)]
    sys.stdout.write("\n".join(rows) + "\n")


if __name__ == "__main__":
    main()
