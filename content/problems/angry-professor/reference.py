"""Reference solution for "Angry Professor".

For each session, count the students whose arrival offset is <= 0 (early or exactly
on time). The session is HELD when that count reaches the quorum K, otherwise it is
CANCELLED.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    pos = 0

    t = int(data[pos])
    pos += 1

    results = []
    for _ in range(t):
        n = int(data[pos])
        k = int(data[pos + 1])
        pos += 2

        on_time = 0
        for _ in range(n):
            arrival = int(data[pos])
            pos += 1
            if arrival <= 0:
                on_time += 1

        results.append("HELD" if on_time >= k else "CANCELLED")

    sys.stdout.write("\n".join(results) + "\n")


if __name__ == "__main__":
    main()
