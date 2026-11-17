"""Plus Minus -- reference solution.

Count the positive, negative, and zero entries in one pass, then print each
count divided by n with six digits after the decimal point. Six digits is this
reference's choice and not a rule: the problem's float comparator accepts any
answer within 1e-4 of the true value, so 0.4 and 0.400000 are both correct.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    positive = 0
    negative = 0
    zero = 0
    for v in values:
        if v > 0:
            positive += 1
        elif v < 0:
            negative += 1
        else:
            zero += 1

    out = sys.stdout
    out.write(f"{positive / n:.6f}\n")
    out.write(f"{negative / n:.6f}\n")
    out.write(f"{zero / n:.6f}\n")


if __name__ == "__main__":
    main()
