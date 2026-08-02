"""Between Two Sets -- brute-force checker.

Try every x from 1 to max(b) and test both divisibility conditions directly
against every element of both lists. No lcm/gcd shortcut, so it is an
independent check on the reference solution.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    m = int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    b = [int(x) for x in data[2 + n:2 + n + m]]

    count = 0
    for x in range(1, max(b) + 1):
        if all(x % ai == 0 for ai in a) and all(bj % x == 0 for bj in b):
            count += 1

    print(count)


if __name__ == "__main__":
    main()
