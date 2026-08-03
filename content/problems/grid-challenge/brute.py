"""Grid Challenge -- definition-literal implementation.

The task is already linear in the grid size, so there is no asymptotically slower
"brute force" worth writing. Instead this follows the statement word for word,
through a different mechanism than reference.py at every step:

- rows are sorted by repeated bisect insertion rather than str/sorted joins,
- the column property is checked by materializing each full column and comparing
  it against its own sorted copy, rather than scanning adjacent row pairs.

A disagreement between the two would mean one of them misreads the statement.
"""

import bisect
import sys


def insertion_sort(word: str) -> list[str]:
    out: list[str] = []
    for ch in word:
        bisect.insort(out, ch)
    return out


def main() -> None:
    data = sys.stdin.read().split()
    idx = 0
    t = int(data[idx])
    idx += 1
    answers = []
    for _ in range(t):
        n = int(data[idx])
        idx += 1
        grid = [insertion_sort(data[idx + i]) for i in range(n)]
        idx += n
        ok = True
        for j in range(n):
            column = [grid[i][j] for i in range(n)]
            if column != sorted(column):
                ok = False
                break
        answers.append("YES" if ok else "NO")
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
