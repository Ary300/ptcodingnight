"""Grading Students -- reference solution.

For each grade g: below 38 it is untouched. Otherwise round up to the next
multiple of 5 when that multiple is less than 3 away; leave it alone otherwise.
Arithmetic only, no searching.
"""

import sys

ROUND_FLOOR = 38


def final_grade(g: int) -> int:
    if g < ROUND_FLOOR:
        return g
    r = ((g + 4) // 5) * 5  # smallest multiple of 5 that is >= g
    return r if r - g < 3 else g


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    grades = [int(x) for x in data[1:1 + n]]
    out = "\n".join(str(final_grade(g)) for g in grades)
    sys.stdout.write(out + "\n")


if __name__ == "__main__":
    main()
