"""Reference solution for "Save the Prisoner!".

The first slice goes to seat s, so the last of m slices lands m - 1 steps
clockwise from s. Working in 0-based seat numbers makes the wrap-around a plain
modulo: seat0 = (s - 1 + m - 1) % n, then convert back to 1-based.
"""

import sys


def last_seat(n: int, m: int, s: int) -> int:
    """Return the 1-based seat that receives the m-th slice starting at seat s."""
    steps = m - 1
    zero_based_start = s - 1
    zero_based_end = (zero_based_start + steps) % n
    return zero_based_end + 1


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    out = []
    pos = 1
    for _ in range(q):
        n = int(data[pos])
        m = int(data[pos + 1])
        s = int(data[pos + 2])
        pos += 3
        out.append(str(last_seat(n, m, s)))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
