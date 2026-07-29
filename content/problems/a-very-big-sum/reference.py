"""Reference solution for 'A Very Big Sum'.

Read n and then n integers, print their exact total.
Python integers are arbitrary precision, so no overflow handling is needed here;
the interesting part of the problem only shows up in Java.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    if not tokens:
        return

    n = int(tokens[0])
    values = tokens[1:1 + n]

    total = 0
    for token in values:
        total += int(token)

    print(total)


if __name__ == "__main__":
    main()
