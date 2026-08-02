"""Gaming Array -- brute force.

Plays the game move by move exactly as the statement describes: find the
maximum tile, truncate the row there, hand the turn over. The player facing an
empty row loses. O(moves * n) per game, which is O(n^2) on an increasing row;
correct by construction, hopeless at the constraint ceiling.
"""

import sys


def winner(row: list[int]) -> str:
    players = ("Kylie", "Gavin")
    turn = 0
    while row:
        idx = row.index(max(row))
        row = row[:idx]
        turn ^= 1
    # players[turn] is the one facing the empty row; the other player won.
    return players[turn ^ 1]


def main() -> None:
    data = sys.stdin.buffer.read().split()
    pos = 0
    g = int(data[pos]); pos += 1
    out: list[str] = []
    for _ in range(g):
        n = int(data[pos]); pos += 1
        row = [int(x) for x in data[pos:pos + n]]
        pos += n
        out.append(winner(row))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
