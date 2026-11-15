"""Two Tables, One Total -- reference solution.

Read two integers from one line and print their sum.
"""

import sys


def main() -> None:
    a, b = (int(x) for x in sys.stdin.read().split()[:2])
    print(a + b)


if __name__ == "__main__":
    main()
