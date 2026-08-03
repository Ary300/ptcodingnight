"""ACM ICPC Team -- reference solution.

Parse each checklist as a big integer bitmask, then walk every unordered pair,
OR the two masks, and count set bits. Track the best coverage seen and how many
pairs reach it. O(n^2) pairs with cheap word-level OR and popcount.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    masks = [int(s, 2) for s in data[2:2 + n]]

    best = -1
    count = 0
    for i in range(n):
        mask_i = masks[i]
        for j in range(i + 1, n):
            topics = (mask_i | masks[j]).bit_count()
            if topics > best:
                best = topics
                count = 1
            elif topics == best:
                count += 1

    print(best)
    print(count)


if __name__ == "__main__":
    main()
