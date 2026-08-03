"""Jumping on the Clouds: Revisited -- reference solution.

The landing sequence from cloud 0 with fixed jump length k is
(k mod n), (2k mod n), ... and it returns to 0 after exactly
m = n / gcd(n, k) jumps. Rather than simulating positions with a while
loop, walk the arithmetic progression i*k mod n for i = 1..m directly,
charging 1 unit per jump plus 2 for every thundercloud landing.
"""

import sys
from math import gcd


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    clouds = [int(x) for x in data[2:2 + n]]

    jumps = n // gcd(n, k)
    energy = 100 - jumps
    for i in range(1, jumps + 1):
        if clouds[(i * k) % n]:
            energy -= 2

    print(energy)


if __name__ == "__main__":
    main()
