"""Jim and the Orders -- reference solution.

Each order i finishes at time t_i + d_i. Sort the order numbers by finish time,
breaking ties toward the smaller order number, and print the resulting sequence.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    finish = [0] * n
    for i in range(n):
        t = int(data[1 + 2 * i])
        d = int(data[2 + 2 * i])
        finish[i] = t + d

    # Python's sort is stable, so sorting the order numbers 1..n (already in
    # increasing order) by finish time alone preserves the ticket-number
    # tie-break for equal finish times.
    served = sorted(range(1, n + 1), key=lambda i: finish[i - 1])

    sys.stdout.write(" ".join(map(str, served)))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
