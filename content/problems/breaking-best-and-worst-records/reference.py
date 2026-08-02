"""Breaking the Records -- reference solution.

Single linear pass. Keep the running highest and lowest score seen so far;
a strictly greater score breaks the high record, a strictly lower score
breaks the low record, and the first score seeds both without counting.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    scores = [int(x) for x in data[1:1 + n]]

    highest = scores[0]
    lowest = scores[0]
    high_breaks = 0
    low_breaks = 0

    for score in scores[1:]:
        if score > highest:
            highest = score
            high_breaks += 1
        elif score < lowest:
            lowest = score
            low_breaks += 1

    print(f"{high_breaks} {low_breaks}")


if __name__ == "__main__":
    main()
