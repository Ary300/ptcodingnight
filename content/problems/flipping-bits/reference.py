"""Flipping bits -- reference solution.

For each unsigned 32-bit reading, XOR with the all-ones 32-bit mask to flip
every bit, and print the results one per line.
"""

import sys

MASK = 0xFFFFFFFF


def main() -> None:
    data = sys.stdin.buffer.read().split()
    q = int(data[0])
    out = []
    for i in range(1, q + 1):
        out.append(str(int(data[i]) ^ MASK))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
