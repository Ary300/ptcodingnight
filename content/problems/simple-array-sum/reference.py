"""Reference solution for 'Simple Array Sum'.

Read n and then n integers, print their sum. The values are small enough that the
total fits in a 32-bit signed integer, so there is nothing subtle here in any
language; this is the warm-up shape of the sum problems.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    if not tokens:
        return

    n = int(tokens[0])
    values = [int(token) for token in tokens[1:1 + n]]

    print(sum(values))


if __name__ == "__main__":
    main()
