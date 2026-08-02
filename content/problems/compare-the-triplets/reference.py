"""Compare the Triplets -- reference solution.

Read the two rating triples, compare them position by position, and award one
point per position to whichever side is strictly higher. Ties award nothing.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    a = [int(x) for x in data[0:3]]
    b = [int(x) for x in data[3:6]]

    first = sum(1 for x, y in zip(a, b) if x > y)
    second = sum(1 for x, y in zip(a, b) if y > x)

    print(f"{first} {second}")


if __name__ == "__main__":
    main()
