"""Grid Challenge -- reference solution.

For each grid: sort every row, then verify that each pair of vertically adjacent
rows is elementwise non-decreasing. Columns are non-decreasing exactly when every
adjacent row pair is, so one pass over the row pairs settles the answer.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    idx = 0
    t = int(data[idx])
    idx += 1
    answers = []
    for _ in range(t):
        n = int(data[idx])
        idx += 1
        rows = ["".join(sorted(data[idx + i])) for i in range(n)]
        idx += n
        ok = True
        for upper, lower in zip(rows, rows[1:]):
            if any(a > b for a, b in zip(upper, lower)):
                ok = False
                break
        answers.append("YES" if ok else "NO")
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
