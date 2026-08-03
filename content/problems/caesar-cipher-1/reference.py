"""Caesar Cipher -- reference solution.

Rotate every English letter forward by k % 26 places, preserving case, via a
single translation table. Non-letters map to themselves.
"""

import string
import sys


def main() -> None:
    lines = sys.stdin.read().splitlines()
    n = int(lines[0])
    s = lines[1]
    k = int(lines[2])
    assert len(s) == n

    shift = k % 26
    lower = string.ascii_lowercase
    upper = string.ascii_uppercase
    table = str.maketrans(
        lower + upper,
        lower[shift:] + lower[:shift] + upper[shift:] + upper[:shift],
    )
    sys.stdout.write(s.translate(table) + "\n")


if __name__ == "__main__":
    main()
