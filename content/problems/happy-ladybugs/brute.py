"""Happy Ladybugs -- brute-force cross-check.

Deliberately different mechanism from reference.py:

- A board with no empty cell cannot change, so it is checked literally against
  the definition: every ladybug must have a same-color cell directly adjacent.
- A board WITH an empty cell and at most EXHAUSTIVE_LIMIT cells is solved by
  enumerating every distinct rearrangement of the cells' contents (with an
  empty cell present, any arrangement of the multiset is reachable by moving
  one ladybug at a time) and testing each arrangement literally for happiness.
  This path encodes none of the counting shortcut and is what the stress test
  exercises against the reference.
- Larger boards with an empty cell fall back to a definition-literal count
  built with a plain loop and dict (no Counter): some color occurring exactly
  once means NO, otherwise YES. There is no honest slow variant for boards of
  this size, so the fallback shares the reference's rule while everything it
  rests on is validated exhaustively on the small path.
"""

import sys
from itertools import permutations

EXHAUSTIVE_LIMIT = 8


def is_happy(cells) -> bool:
    n = len(cells)
    for i, ch in enumerate(cells):
        if ch == "_":
            continue
        left = i > 0 and cells[i - 1] == ch
        right = i + 1 < n and cells[i + 1] == ch
        if not (left or right):
            return False
    return True


def board_answer(b: str) -> str:
    if "_" not in b:
        return "YES" if is_happy(b) else "NO"
    if len(b) <= EXHAUSTIVE_LIMIT:
        for arrangement in set(permutations(b)):
            if is_happy(arrangement):
                return "YES"
        return "NO"
    counts: dict[str, int] = {}
    for ch in b:
        counts[ch] = counts.get(ch, 0) + 1
    del counts["_"]
    for value in counts.values():
        if value == 1:
            return "NO"
    return "YES"


def main() -> None:
    data = sys.stdin.read().split()
    g = int(data[0])
    answers = []
    idx = 1
    for _ in range(g):
        idx += 1
        answers.append(board_answer(data[idx]))
        idx += 1
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
