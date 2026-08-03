"""Cavity Map -- reference solution.

Read the n x n digit grid and replace every interior cell whose digit is
strictly greater than all four orthogonal neighbours with 'X'. Digits compare
correctly as characters ('1' < ... < '9'), so the whole pass works directly on
the input strings with no integer conversion.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    grid = data[1:1 + n]

    out_rows = list(grid)
    for i in range(1, n - 1):
        up = grid[i - 1]
        row = grid[i]
        down = grid[i + 1]
        marked = list(row)
        changed = False
        for j in range(1, n - 1):
            c = row[j]
            if c > row[j - 1] and c > row[j + 1] and c > up[j] and c > down[j]:
                marked[j] = "X"
                changed = True
        if changed:
            out_rows[i] = "".join(marked)

    sys.stdout.write("\n".join(out_rows) + "\n")


if __name__ == "__main__":
    main()
