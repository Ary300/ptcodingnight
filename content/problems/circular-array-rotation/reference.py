"""Reference solution for circular-array-rotation.

After k forward ticks, the light that started in slot i sits in slot (i + k) % n.
Reading that backwards: slot j now holds the value that started in slot (j - k) % n.
No array is ever physically rotated; we just index into the original list.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    pos = 0

    n = int(data[pos]); pos += 1
    k = int(data[pos]); pos += 1
    q = int(data[pos]); pos += 1

    values = [int(data[pos + i]) for i in range(n)]
    pos += n

    shift = k % n

    answers = []
    for _ in range(q):
        j = int(data[pos]); pos += 1
        source = (j - shift) % n
        answers.append(values[source])

    sys.stdout.write("\n".join(map(str, answers)) + "\n")


main()
