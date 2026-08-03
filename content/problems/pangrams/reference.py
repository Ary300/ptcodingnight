"""Pangrams -- reference solution.

Read the whole line, collect the set of distinct letters seen (case-folded),
and report pangram exactly when all 26 letters of the alphabet are present.
"""

import sys

ALPHABET_SIZE = 26


def main() -> None:
    s = sys.stdin.read()
    seen = {ch for ch in s.lower() if "a" <= ch <= "z"}
    print("pangram" if len(seen) == ALPHABET_SIZE else "not pangram")


if __name__ == "__main__":
    main()
