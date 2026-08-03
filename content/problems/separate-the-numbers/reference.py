"""Separate the Numbers -- reference solution.

Try each possible length for the first number, from 1 digit up to half the tape
(any longer and there is no room for a second number). Rebuild the tape that a
shipment starting at that number would print and compare it to the input. The
first length that matches yields the smallest valid first number, because a
longer prefix of a string with no leading zero is always a larger integer.
"""

import sys


def main() -> None:
    s = sys.stdin.readline().strip()
    n = len(s)

    if n >= 2 and s[0] != "0":
        for length in range(1, n // 2 + 1):
            first = int(s[:length])
            built_parts = [s[:length]]
            built_len = length
            value = first
            while built_len < n:
                value += 1
                part = str(value)
                built_parts.append(part)
                built_len += len(part)
            if "".join(built_parts) == s:
                print(f"YES {first}")
                return

    print("NO")


if __name__ == "__main__":
    main()
