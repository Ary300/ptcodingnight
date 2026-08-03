"""Happy Ladybugs -- reference solution.

For each board:
- A color that appears exactly once can never gain a same-color neighbor: NO.
- Otherwise, if at least one cell is empty, the ladybugs can be regrouped into
  contiguous same-color blocks one flight at a time (any arrangement of the
  multiset is reachable once an empty cell exists), and every count is at least
  two, so every ladybug ends up happy: YES.
- With no empty cell nothing can move, so the board must already be happy:
  every ladybug needs a same-color cell immediately left or right.
"""

import sys
from collections import Counter


def board_answer(b: str) -> str:
    counts = Counter(b)
    empties = counts.pop("_", 0)
    if any(v == 1 for v in counts.values()):
        return "NO"
    if empties > 0:
        return "YES"
    n = len(b)
    for i, ch in enumerate(b):
        left = i > 0 and b[i - 1] == ch
        right = i + 1 < n and b[i + 1] == ch
        if not (left or right):
            return "NO"
    return "YES"


def main() -> None:
    data = sys.stdin.read().split()
    g = int(data[0])
    answers = []
    idx = 1
    for _ in range(g):
        idx += 1  # n is implied by the string itself
        answers.append(board_answer(data[idx]))
        idx += 1
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
