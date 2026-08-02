"""Brute-force check for 'Simple Array Sum'.

Deliberately different from reference.py: no bulk read and no sum() call. It
reads the count line, then walks the value line token by token, keeping a
running total with explicit index bookkeeping. Obviously correct, and on an
Easy-tier input it still finishes inside the time limit.
"""

import sys


def main() -> None:
    first_line = sys.stdin.readline()
    if not first_line.strip():
        return

    n = int(first_line)
    tokens = sys.stdin.readline().split()

    total = 0
    index = 0
    while index < n:
        total = total + int(tokens[index])
        index = index + 1

    print(total)


if __name__ == "__main__":
    main()
