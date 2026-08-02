"""sWAP cASE -- reference solution.

Read one line and toggle the case of every ASCII letter by arithmetic on the
character code; everything that is not an ASCII letter passes through untouched.
"""

import sys

CASE_BIT = 32  # distance between 'A' and 'a' in ASCII


def toggle(ch: str) -> str:
    if "a" <= ch <= "z":
        return chr(ord(ch) - CASE_BIT)
    if "A" <= ch <= "Z":
        return chr(ord(ch) + CASE_BIT)
    return ch


def main() -> None:
    s = sys.stdin.read().rstrip("\n")
    sys.stdout.write("".join(toggle(ch) for ch in s))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
