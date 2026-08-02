"""Bill Division -- brute-force cross-check.

Deliberately different from the reference: instead of summing everything,
subtracting the unshared item, and halving once with integer division, it walks
the receipt and adds exactly half of each shared price as an exact rational
(Fraction(p, 2)), then asserts the accumulated fair charge is a whole number.
Any halving or off-by-one slip in the reference would disagree with this.
Used for stress-testing against reference.py; never shipped to the judge.
"""

import sys
from fractions import Fraction


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    k = int(data[1])
    prices = [int(x) for x in data[2:2 + n]]
    b = int(data[2 + n])

    fair = Fraction(0)
    for position, price in enumerate(prices, start=1):
        if position != k:
            fair += Fraction(price, 2)

    assert fair.denominator == 1, "shared sum was odd, which the constraints forbid"
    fair_int = fair.numerator

    if b == fair_int:
        print("Fair")
    else:
        print(b - fair_int)


if __name__ == "__main__":
    main()
