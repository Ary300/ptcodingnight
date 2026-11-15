"""The Warmer Reading -- reference solution.

Read two integers from one line and print the larger one.
"""

import sys


def main() -> None:
    a, b = (int(x) for x in sys.stdin.read().split()[:2])
    print(a if a >= b else b)


if __name__ == "__main__":
    main()
