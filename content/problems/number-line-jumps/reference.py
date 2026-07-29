"""Reference solution for "Number Line Jumps".

Rover 1 is at s1 + k * j1 after k beeps; rover 2 is at s2 + k * j2.
They share a mark when s1 + k * j1 == s2 + k * j2, i.e. k * (j1 - j2) == s2 - s1.

Let gap = s2 - s1 and closing = j1 - j2.
  * closing == 0: the distance between the rovers never changes, so they meet
    (at beep 0) exactly when gap == 0.
  * closing != 0: k = gap / closing, which counts only if it is a whole number
    and is not negative.
"""

import sys


def first_meeting(s1: int, j1: int, s2: int, j2: int) -> str:
    gap = s2 - s1
    closing = j1 - j2

    if closing == 0:
        return "0" if gap == 0 else "NEVER"

    if gap % closing != 0:
        return "NEVER"

    beeps = gap // closing
    if beeps < 0:
        return "NEVER"
    return str(beeps)


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])

    answers = []
    for i in range(q):
        base = 1 + 4 * i
        s1 = int(data[base])
        j1 = int(data[base + 1])
        s2 = int(data[base + 2])
        j2 = int(data[base + 3])
        answers.append(first_meeting(s1, j1, s2, j2))

    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
