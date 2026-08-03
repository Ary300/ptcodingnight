"""Pangrams -- brute-force / definition-literal solution.

For each of the 26 letters, scan the entire input character by character
looking for that letter in either case. No sets, no case folding of the
whole string: this is the definition transcribed directly. O(26 * |s|),
which is the same asymptotic class as the reference (the task is O(n) by
nature and has no meaningfully slower correct variant), but the approach
is independent enough to cross-check the reference.
"""

import sys

ALPHABET_SIZE = 26


def main() -> None:
    s = sys.stdin.read()
    for i in range(ALPHABET_SIZE):
        lower = chr(ord("a") + i)
        upper = chr(ord("A") + i)
        found = False
        for ch in s:
            if ch == lower or ch == upper:
                found = True
                break
        if not found:
            print("not pangram")
            return
    print("pangram")


if __name__ == "__main__":
    main()
