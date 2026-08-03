"""Lonely Integer -- reference solution.

XOR every value in the list together. Each value that appears twice cancels
itself out (x ^ x == 0), so the fold collapses to exactly the one value that
appears once. Single pass, O(1) extra memory.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    result = 0
    for token in data[1:1 + n]:
        result ^= int(token)
    print(result)


if __name__ == "__main__":
    main()
