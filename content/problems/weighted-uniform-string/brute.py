"""Weighted Uniform Strings -- brute force.

Definition-literal approach: enumerate every maximal run of identical letters,
materialize the weight of every uniform substring (letter weight times every
possible length up to the run length) into a set, and answer each query by
membership. Same asymptotic cost as the reference but a different mechanism:
this one builds the full achievable set, the reference never builds it.
"""

import sys
from itertools import groupby


def main() -> None:
    data = sys.stdin.buffer.read().split()
    s = data[0].decode()
    q = int(data[1])
    queries = [int(x) for x in data[2:2 + q]]

    achievable: set[int] = set()
    for ch, group in groupby(s):
        weight = ord(ch) - 96
        run_length = sum(1 for _ in group)
        for k in range(1, run_length + 1):
            achievable.add(weight * k)

    sys.stdout.write(
        "\n".join("Yes" if x in achievable else "No" for x in queries) + "\n"
    )


if __name__ == "__main__":
    main()
