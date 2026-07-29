import sys


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    k = int(data[1])
    teeth = [int(x) for x in data[2:2 + n]]

    # How many gears fall into each remainder class mod k.
    remainder_counts = [0] * k
    for t in teeth:
        remainder_counts[t % k] += 1

    total = 0

    # Pairs drawn from two different remainder classes r and s, r < s.
    for r in range(k):
        for s in range(r + 1, k):
            if (r + s) % k == 0:
                total += remainder_counts[r] * remainder_counts[s]

    # Pairs drawn from the same remainder class r, which works when 2r % k == 0.
    for r in range(k):
        if (2 * r) % k == 0:
            c = remainder_counts[r]
            total += c * (c - 1) // 2

    print(total)


main()
