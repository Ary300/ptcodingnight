"""Reference solution for "Solve Me First".

Read two integers, one per line, and print their sum.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    a = int(tokens[0])
    b = int(tokens[1])
    print(a + b)


if __name__ == "__main__":
    main()
