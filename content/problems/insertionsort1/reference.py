"""Insertion Sort - Part 1 -- reference solution.

Direct simulation of one insertion step. Store the last element, walk left
copying every strictly-greater element one slot right, printing the whole
array after each copy, then place the stored element and print once more.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    arr = [int(x) for x in data[1:1 + n]]

    out: list[str] = []
    value = arr[-1]
    j = n - 2
    while j >= 0 and arr[j] > value:
        arr[j + 1] = arr[j]
        out.append(" ".join(map(str, arr)))
        j -= 1
    arr[j + 1] = value
    out.append(" ".join(map(str, arr)))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
