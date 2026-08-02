"""Birthday Cake Candles -- reference solution.

Read the candle heights, find the maximum height, and count how many candles
stand at exactly that height. One linear pass for the max, one for the count.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    heights = [int(x) for x in data[1:1 + n]]

    tallest = max(heights)
    print(heights.count(tallest))


if __name__ == "__main__":
    main()
