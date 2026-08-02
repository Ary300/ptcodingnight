"""Between Two Sets -- reference solution.

A qualifying x must be a multiple of lcm(a) and a divisor of gcd(b). Walk the
multiples of lcm(a) up to gcd(b) and count the ones that divide gcd(b) evenly.
"""

import sys
from math import gcd


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    m = int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    b = [int(x) for x in data[2 + n:2 + n + m]]

    lcm_a = 1
    for value in a:
        lcm_a = lcm_a * value // gcd(lcm_a, value)

    gcd_b = 0
    for value in b:
        gcd_b = gcd(gcd_b, value)

    count = 0
    candidate = lcm_a
    while candidate <= gcd_b:
        if gcd_b % candidate == 0:
            count += 1
        candidate += lcm_a

    print(count)


if __name__ == "__main__":
    main()
