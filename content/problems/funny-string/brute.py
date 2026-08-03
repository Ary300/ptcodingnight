"""Funny String -- definition-literal check.

This task is O(n) by nature and has no meaningfully slower correct algorithm,
so this file is the most literal transcription of the statement instead: it
materializes the reversed string r, builds the full forward jump list of s and
the full jump list of r exactly as the definition reads, and compares them
position by position with ord() calls in a plain Python loop.
"""

import sys


def is_funny(s: str) -> bool:
    r = s[::-1]
    forward = []
    for i in range(1, len(s)):
        forward.append(abs(ord(s[i]) - ord(s[i - 1])))
    backward = []
    for i in range(1, len(r)):
        backward.append(abs(ord(r[i]) - ord(r[i - 1])))
    for i in range(len(forward)):
        if forward[i] != backward[i]:
            return False
    return True


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    lines = []
    for k in range(1, q + 1):
        lines.append("Funny" if is_funny(data[k]) else "Not Funny")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
