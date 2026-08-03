"""Funny String -- reference solution.

A string is funny when its sequence of absolute adjacent-character jumps is
identical for the string and its reverse. Reversing a string reverses the jump
sequence, so the string is funny exactly when its jump sequence is a
palindrome. Build the jump list once per string and compare it to its own
reversal; both steps run at C speed, so the whole input is linear time.
"""

import sys


def is_funny(s: str) -> bool:
    b = s.encode("ascii")
    jumps = [abs(b[i] - b[i - 1]) for i in range(1, len(b))]
    return jumps == jumps[::-1]


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    results = ["Funny" if is_funny(data[k]) else "Not Funny" for k in range(1, q + 1)]
    sys.stdout.write("\n".join(results) + "\n")


if __name__ == "__main__":
    main()
