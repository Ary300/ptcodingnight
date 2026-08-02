"""Larry's Array -- reference solution.

The operation (p_i, p_{i+1}, p_{i+2}) -> (p_{i+1}, p_{i+2}, p_i) is a 3-cycle of
adjacent positions, which is the composition of two adjacent transpositions. Every
operation therefore changes the number of inversions by an even amount, so the
parity of the permutation is invariant. Conversely, every even permutation of
n >= 3 elements is a product of 3-cycles of consecutive positions, and for n < 3
an even permutation is already the identity. So a shelf is sortable exactly when
its permutation is even.

The parity is computed in O(n) per shelf from the cycle decomposition: a cycle of
length L contributes L - 1 transpositions, and the permutation is even when the
total is even.
"""

import sys


def is_sortable(perm: list[int]) -> bool:
    n = len(perm)
    visited = bytearray(n)
    transpositions = 0
    for start in range(n):
        if visited[start]:
            continue
        length = 0
        j = start
        while not visited[j]:
            visited[j] = 1
            j = perm[j] - 1
            length += 1
        transpositions += length - 1
    return transpositions % 2 == 0


def main() -> None:
    data = sys.stdin.buffer.read().split()
    q = int(data[0])
    pos = 1
    answers = []
    for _ in range(q):
        n = int(data[pos])
        pos += 1
        perm = [int(x) for x in data[pos:pos + n]]
        pos += n
        answers.append("YES" if is_sortable(perm) else "NO")
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
