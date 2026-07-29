"""Reference solution for "Halloween Sale".

For each shopper we walk the price down one keychain at a time while the price is
still above the floor.  Once the price reaches the floor m it never changes again,
so every remaining keychain costs the same and a single division finishes the job.

The walking part runs at most (p - m) / d times, and it also stops as soon as the
shopper runs out of money, so it is cheap for every input allowed by the statement.
"""

import sys


def shop(p: int, d: int, m: int, b: int) -> tuple:
    """Return (number of keychains bought, cents spent) for one shopper."""
    price = p
    budget = b
    count = 0
    spent = 0

    # Phase 1: the price is still falling.  Buy them one at a time, in order.
    while price > m and budget >= price:
        budget -= price
        spent += price
        count += 1
        price = price - d
        if price < m:
            price = m

    # Phase 2: if we stopped because the price bottomed out, everything left on
    # the table costs exactly m, so the rest is plain division.  If we stopped
    # because the money ran out, budget < price and no more can be bought.
    if price == m and budget >= m:
        extra = budget // m
        count += extra
        spent += extra * m

    return count, spent


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    pos = 1
    out = []
    for _ in range(q):
        p = int(data[pos])
        d = int(data[pos + 1])
        m = int(data[pos + 2])
        b = int(data[pos + 3])
        pos += 4
        count, spent = shop(p, d, m, b)
        out.append(f"{count} {spent}")
    sys.stdout.write("\n".join(out) + "\n")


main()
