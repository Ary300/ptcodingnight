"""Insertion Sort - Part 2 -- definition-literal implementation.

The output of this task is itself Theta(n^2), so there is no asymptotically
slower "brute" to contrast with the reference. This version is instead the
most literal transcription of the definition: in-place insertion sort with
element-by-element shifting, printing the whole array after each outer
iteration.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]

    out = []
    for i in range(1, n):
        key = a[i]
        j = i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
        out.append(" ".join(map(str, a)))

    sys.stdout.write("\n".join(out) + ("\n" if out else ""))


if __name__ == "__main__":
    main()
