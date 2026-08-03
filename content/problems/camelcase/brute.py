"""CamelCase -- definition-literal brute force.

Instead of counting uppercase letters, actually split the name into its words:
walk the string, start a fresh word at every uppercase letter, collect the words
into a list, and report how many words were built. Same O(n) complexity as the
reference (no slower approach exists for this task), but it follows the
statement's definition of "word" mechanically rather than using the arithmetic
shortcut.
"""

import sys


def main() -> None:
    s = sys.stdin.readline().strip()
    words: list[str] = []
    current = ""
    for ch in s:
        if ch.isupper() and current:
            words.append(current)
            current = ch
        else:
            current += ch
    if current:
        words.append(current)
    print(len(words))


if __name__ == "__main__":
    main()
