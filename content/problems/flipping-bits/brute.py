"""Flipping bits -- definition-literal implementation.

Renders each value as a 32-character binary string, swaps every '0' for '1'
and every '1' for '0' character by character, and parses the result back.
Same asymptotic complexity as the reference (the task is O(1) per query, so
no honest slow variant exists), but it follows the statement's wording
mechanically instead of using a bitwise operation.
"""

import sys


def flip(n: int) -> int:
    bits = format(n, "032b")
    flipped = "".join("1" if b == "0" else "0" for b in bits)
    return int(flipped, 2)


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    for i in range(1, q + 1):
        print(flip(int(data[i])))


if __name__ == "__main__":
    main()
