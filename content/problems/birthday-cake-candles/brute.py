"""Birthday Cake Candles -- brute-force check.

Obviously correct by a different route: sort the heights in descending order
and count the length of the leading run of equal values. Whatever the sort
puts first is the maximum, and the run length is how many candles share it.
No attention paid to doing it in one pass.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    heights = [int(x) for x in data[1:1 + n]]

    ordered = sorted(heights, reverse=True)
    count = 0
    for h in ordered:
        if h != ordered[0]:
            break
        count += 1

    print(count)


if __name__ == "__main__":
    main()
