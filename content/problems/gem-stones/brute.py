"""Gemstones -- brute-force check.

Definition-literal: for each of the 26 lowercase letters, scan every string
character by character (no sets, no `in`-on-string shortcuts beyond a manual
loop) and ask whether the letter occurs in all of them. The task is O(total
input) with no natural slow variant, so this is the same complexity as the
reference but a structurally different implementation.
"""

import sys


def occurs(letter: str, rock: str) -> bool:
    for ch in rock:
        if ch == letter:
            return True
    return False


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    rocks = data[1:1 + n]

    gems = 0
    for code in range(ord("a"), ord("z") + 1):
        letter = chr(code)
        if all(occurs(letter, rock) for rock in rocks):
            gems += 1

    print(gems)


if __name__ == "__main__":
    main()
