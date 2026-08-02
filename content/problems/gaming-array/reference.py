"""Gaming Array -- reference solution.

Each move removes the current maximum and everything to its right, so the game
lasts exactly as many moves as there are prefix maxima (values larger than
everything before them): every prefix maximum becomes the row's maximum at some
point, and nothing else ever does. Kylie moves first, so she wins exactly when
that count is odd. O(n) per game.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    pos = 0
    g = int(data[pos]); pos += 1
    out: list[str] = []
    for _ in range(g):
        n = int(data[pos]); pos += 1
        moves = 0
        best = 0
        for i in range(pos, pos + n):
            v = int(data[i])
            if v > best:
                best = v
                moves += 1
        pos += n
        out.append("Kylie" if moves % 2 == 1 else "Gavin")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
