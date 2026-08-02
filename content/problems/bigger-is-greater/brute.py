"""Bigger is Greater -- brute force.

For each word, enumerate every distinct arrangement of its letters, sort them,
and pick the first one strictly greater than the word. Obviously correct
straight from the problem text, and factorial in the word length, so it is
only usable on tiny words. On a max-size input it would run for longer than
the lifetime of the contest.
"""

import sys
from itertools import permutations


def brute_next(word: str) -> str | None:
    candidates = sorted(set("".join(p) for p in permutations(word)))
    for candidate in candidates:
        if candidate > word:
            return candidate
    return None


def main() -> None:
    data = sys.stdin.read().split()
    t = int(data[0])
    out = []
    for k in range(1, t + 1):
        result = brute_next(data[k])
        out.append(result if result is not None else "no answer")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
