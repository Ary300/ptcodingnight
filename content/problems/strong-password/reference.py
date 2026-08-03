"""Strong Password -- reference solution.

A password is strong when its length is at least MIN_LENGTH and it contains at
least one character from each of the four classes (digit, lowercase, uppercase,
special). Each appended character can shrink the length deficit by one and fix
at most one missing class, and any class deficit can be paid while also paying
the length deficit, so the answer is max(length deficit, missing classes).
"""

import sys

MIN_LENGTH = 6
SPECIALS = set("!@#$%^&*()-+")


def main() -> None:
    s = sys.stdin.readline().rstrip("\n")

    has_digit = any(c.isdigit() for c in s)
    has_lower = any("a" <= c <= "z" for c in s)
    has_upper = any("A" <= c <= "Z" for c in s)
    has_special = any(c in SPECIALS for c in s)

    missing = 4 - sum([has_digit, has_lower, has_upper, has_special])
    length_deficit = MIN_LENGTH - len(s)

    print(max(missing, length_deficit, 0))


if __name__ == "__main__":
    main()
