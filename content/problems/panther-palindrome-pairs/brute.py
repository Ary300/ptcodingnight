"""Panther Palindrome Pairs -- brute-force check.

Independent approach: try every unordered pair of positions and compare the second tag with
the first one reversed, character by character. Quadratic, so only for cross-checking the
reference on small inputs.
"""

import sys


def is_mirror(a: str, b: str) -> bool:
    if len(a) != len(b):
        return False
    return all(a[i] == b[len(b) - 1 - i] for i in range(len(a)))


def main() -> None:
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    tags = tokens[1 : 1 + n]
    pairs = 0
    for i in range(n):
        for j in range(i + 1, n):
            if is_mirror(tags[i], tags[j]):
                pairs += 1
    sys.stdout.write(f"{pairs}\n")


if __name__ == "__main__":
    main()
