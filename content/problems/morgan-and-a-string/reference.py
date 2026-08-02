"""Morgan and a String -- reference solution.

Greedy merge: at each step, take the front character of whichever string has the
lexicographically smaller remaining suffix. Suffixes are compared with a sentinel
character greater than every letter appended to both strings, so that when one
remainder is a prefix of the other, the longer remainder wins the comparison.
That is the whole trap: comparing only the front characters, or treating an
exhausted string as "smaller", both produce wrong merges (see CA vs C -> CAC).

Suffix comparisons are done on bytes slices, so each comparison runs at C speed.
With |a|, |b| <= 10^4 the worst case (both strings one repeated letter) stays
comfortably inside the limit.
"""

import sys

SENTINEL = b"~"  # greater than every uppercase letter


def smallest_merge(a: bytes, b: bytes) -> bytes:
    sa = a + SENTINEL
    sb = b + SENTINEL
    la = len(a)
    lb = len(b)
    i = 0
    j = 0
    out = bytearray()
    while i < la and j < lb:
        ca = sa[i]
        cb = sb[j]
        if ca < cb:
            out.append(ca)
            i += 1
        elif ca > cb:
            out.append(cb)
            j += 1
        elif sa[i:] <= sb[j:]:
            out.append(ca)
            i += 1
        else:
            out.append(cb)
            j += 1
    out += sa[i:la]
    out += sb[j:lb]
    return bytes(out)


def main() -> None:
    data = sys.stdin.buffer.read().split()
    a, b = data[0], data[1]
    sys.stdout.buffer.write(smallest_merge(a, b) + b"\n")


if __name__ == "__main__":
    main()
