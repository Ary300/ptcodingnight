"""CamelCase -- reference solution.

A camelCase name starts with a lowercase word and begins a new word at every
uppercase letter, so the word count is 1 plus the number of uppercase letters.
"""

import sys


def main() -> None:
    s = sys.stdin.readline().strip()
    print(1 + sum(1 for ch in s if ch.isupper()))


if __name__ == "__main__":
    main()
