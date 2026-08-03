"""Big Sorting -- brute-force check.

Definition-literal approach: convert every numeral to a Python integer and
sort by that value. This is numeric order by definition and shares nothing
with the reference's length-then-lexicographic argument, which is what makes
it a useful cross-check. It leans on arbitrary-precision integers, so on
CPython 3.11+ the conversion length limit has to be lifted first.
"""

import sys


def main() -> None:
    if hasattr(sys, "set_int_max_str_digits"):
        sys.set_int_max_str_digits(0)
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    numerals = data[1:1 + n]
    numerals.sort(key=int)
    sys.stdout.buffer.write(b"\n".join(numerals) + b"\n")


if __name__ == "__main__":
    main()
