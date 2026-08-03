"""Reference solution for 'Sum vs XOR'.

n + x == n ^ x holds exactly when the addition never carries, i.e. when x has no
set bit in common with n. Every such x with 0 <= x <= n is a subset of the zero
bits of n strictly below n's highest set bit (any such subset is automatically
< 2^(highest bit) <= n). So the answer is 2^(number of zero bits in the binary
representation of n). n = 0 has no set bits at all; only x = 0 qualifies.
"""

import sys


def solve(n: int) -> int:
    if n == 0:
        return 1
    zero_bits = bin(n)[2:].count("0")
    return 1 << zero_bits


def main() -> None:
    n = int(sys.stdin.read().split()[0])
    print(solve(n))


if __name__ == "__main__":
    main()
