"""Panther Palindrome Pairs -- reference solution.

One pass with a dictionary of how many times each tag has been seen so far. For each tag,
the number of earlier tags equal to its reverse is the number of new mirror pairs it closes.
Counting before inserting is what stops a tag from being paired with itself, and makes
identical palindromes pair with each other the right number of times.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    tags = tokens[1 : 1 + n]

    seen: dict[str, int] = {}
    pairs = 0
    for tag in tags:
        pairs += seen.get(tag[::-1], 0)
        seen[tag] = seen.get(tag, 0) + 1

    sys.stdout.write(f"{pairs}\n")


if __name__ == "__main__":
    main()
