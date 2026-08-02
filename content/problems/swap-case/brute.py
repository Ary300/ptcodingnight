"""sWAP cASE -- brute-force check.

Independent approach: instead of character-code arithmetic, compare each
character against its own uppercase and lowercase forms and pick the other one.
For ASCII input this is exactly the toggled case. No attention paid to speed;
the answer string is built by repeated concatenation.
"""

import sys


def main() -> None:
    s = sys.stdin.read().rstrip("\n")
    result = ""
    for ch in s:
        if ch.isalpha() and ch == ch.upper() and ch != ch.lower():
            result += ch.lower()
        elif ch.isalpha() and ch == ch.lower() and ch != ch.upper():
            result += ch.upper()
        else:
            result += ch
    sys.stdout.write(result + "\n")


if __name__ == "__main__":
    main()
