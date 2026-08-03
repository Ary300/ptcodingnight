"""Brute-force solution for 'Sum vs XOR'.

A per-candidate enumeration of x in [0, n] is O(n) and can never terminate at
n = 10^18, so the definition-literal check is instead run bit by bit: this is a
digit DP that constructs x one binary digit at a time (LSB first) and directly
simulates the addition n + x with a carry, demanding that every sum bit equal
the corresponding XOR bit and that no carry survive the top. The x <= n bound
is tracked as a "suffix less-or-equal" flag updated from the low end. No use is
made of the closed form the reference solution relies on; equality of n + x and
n ^ x is checked by actually adding.
"""

import sys


def count_matches(n: int) -> int:
    width = max(n.bit_length(), 1)
    # state: (carry, suffix_le) -> number of partial x's reaching it, where
    # suffix_le means the low bits of x chosen so far form a value <= the
    # corresponding low bits of n.
    states = {(0, True): 1}
    for i in range(width):
        n_bit = (n >> i) & 1
        nxt: dict[tuple[int, bool], int] = {}
        for (carry, suffix_le), ways in states.items():
            for x_bit in (0, 1):
                total = n_bit + x_bit + carry
                if (total & 1) != (n_bit ^ x_bit):
                    continue
                if x_bit < n_bit:
                    new_le = True
                elif x_bit > n_bit:
                    new_le = False
                else:
                    new_le = suffix_le
                key = (total >> 1, new_le)
                nxt[key] = nxt.get(key, 0) + ways
        states = nxt
    return sum(
        ways for (carry, suffix_le), ways in states.items() if carry == 0 and suffix_le
    )


def main() -> None:
    n = int(sys.stdin.read().split()[0])
    print(count_matches(n))


if __name__ == "__main__":
    main()
