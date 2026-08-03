"""Strong Password -- brute-force checker.

Definition-literal approach with no closed formula: for k = 0, 1, 2, ..., try
every way of assigning each of the k appended characters to one of the four
character classes, and report the first k for which some assignment makes the
password strong (length >= 6 and all four classes present). Appended characters
only matter through their class, so enumerating class assignments (4^k of them)
is an exhaustive search over appended strings.
"""

import sys
from itertools import product

MIN_LENGTH = 6
SPECIALS = set("!@#$%^&*()-+")
CLASSES = ("digit", "lower", "upper", "special")


def classes_of(s: str) -> set[str]:
    present: set[str] = set()
    for c in s:
        if c.isdigit():
            present.add("digit")
        elif "a" <= c <= "z":
            present.add("lower")
        elif "A" <= c <= "Z":
            present.add("upper")
        elif c in SPECIALS:
            present.add("special")
    return present


def main() -> None:
    s = sys.stdin.readline().rstrip("\n")
    base = classes_of(s)

    for k in range(0, MIN_LENGTH + 4 + 1):
        for added in product(CLASSES, repeat=k):
            if len(s) + k >= MIN_LENGTH and base | set(added) == set(CLASSES):
                print(k)
                return

    raise AssertionError("no answer found within search bound")


if __name__ == "__main__":
    main()
