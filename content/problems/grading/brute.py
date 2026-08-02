"""Grading Students -- brute-force cross-check.

Different approach from reference.py on purpose: instead of computing the next
multiple of 5 arithmetically, walk upward from the grade one step at a time and
stop at the first multiple of 5. If that walk took fewer than 3 steps and the
grade was eligible (38 or more), the walked-to value wins.
"""

import sys

ROUND_FLOOR = 38


def final_grade(g: int) -> int:
    if g < ROUND_FLOOR:
        return g
    steps = 0
    candidate = g
    while candidate % 5 != 0:
        candidate += 1
        steps += 1
    return candidate if steps < 3 else g


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    grades = [int(x) for x in data[1:1 + n]]
    for g in grades:
        print(final_grade(g))


if __name__ == "__main__":
    main()
