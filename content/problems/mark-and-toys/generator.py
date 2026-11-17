"""Mark and Toys -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed encodes both size and shape:
n = max(1, min(MAX_N, (seed // 8) ** 2)) and shape = seed % 8, so any size can
be paired with any adversarial shape. Shapes cover uniform noise, all-equal
prices, sorted and reverse-sorted shelves, an exact-prefix-sum budget
boundary, a budget below every price, a budget covering everything, and heavy
duplicates.

Sizes are kept moderate for a casual contest: n <= 1000 and every price is at
most 10^6, so the whole shelf costs at most 10^9 and every budget, running
total and answer fits in a signed 32-bit int.

Tests 01 and 02 are the hand-written samples. The rest come from these seeds:

    test  seed  n     shape
    03       8     1  0  uniform noise
    04      13     1  5  nothing affordable
    05      14     1  6  everything affordable
    06      33    16  1  all equal
    07      36    16  4  budget exactly on a prefix sum
    08      50    36  2  sorted ascending
    09      51    36  3  sorted descending
    10      63    49  7  heavy duplicates
    11      85   100  5  nothing affordable
    12      94   121  6  everything affordable
    13     160   400  0  uniform noise
    14     252   961  4  budget exactly on a prefix sum
    15     809  1000  1  all equal
    16    1616  1000  0  uniform noise
    17    2540  1000  4  budget one below a prefix sum
    18    2551  1000  7  heavy duplicates
"""

import random
import sys

MAX_N = 1000
MAX_PRICE = 10**6
# The whole shelf costs at most MAX_N * MAX_PRICE, so no budget beyond that
# changes an answer, and it keeps k inside a signed 32-bit int.
MAX_K = MAX_N * MAX_PRICE


def choose_n(seed: int) -> int:
    return max(1, min(MAX_N, (seed // 8) ** 2))


def clamp_k(k: int) -> int:
    return max(1, min(MAX_K, k))


def build_case(seed: int, n: int, rng: random.Random) -> tuple[list[int], int]:
    shape = seed % 8

    if shape == 0:
        # Uniform noise; budget a random fraction of the total, sometimes over.
        prices = [rng.randint(1, MAX_PRICE) for _ in range(n)]
        k = clamp_k(int(sum(prices) * rng.uniform(0.0, 1.2)))
        return prices, k

    if shape == 1:
        # Every toy costs the same; budget buys an exact number plus change.
        price = rng.choice([1, MAX_PRICE, rng.randint(1, MAX_PRICE)])
        m = rng.randint(0, n)
        k = clamp_k(price * m + rng.randint(0, price - 1))
        return [price] * n, k

    if shape == 2:
        # Already sorted ascending.
        prices = sorted(rng.randint(1, MAX_PRICE) for _ in range(n))
        k = clamp_k(int(sum(prices) * rng.uniform(0.1, 0.9)))
        return prices, k

    if shape == 3:
        # Reverse sorted.
        prices = sorted((rng.randint(1, MAX_PRICE) for _ in range(n)), reverse=True)
        k = clamp_k(int(sum(prices) * rng.uniform(0.1, 0.9)))
        return prices, k

    if shape == 4:
        # Budget lands exactly on a prefix sum, or one below it.
        prices = [rng.randint(1, MAX_PRICE) for _ in range(n)]
        c = rng.randint(1, n)
        # seed % 8 == 4 forces seed even, so the branch keys off seed // 8.
        exact = sum(sorted(prices)[:c])
        k = clamp_k(exact if (seed // 8) % 2 == 0 else exact - 1)
        return prices, k

    if shape == 5:
        # Nothing affordable: budget strictly below the cheapest toy.
        prices = [rng.randint(2, MAX_PRICE) for _ in range(n)]
        k = clamp_k(min(prices) - 1)
        return prices, k

    if shape == 6:
        # Everything affordable: budget at least the whole shelf.
        prices = [rng.randint(1, MAX_PRICE // n) for _ in range(n)]
        k = clamp_k(sum(prices) + rng.randint(0, 1000))
        return prices, k

    # shape == 7: heavy duplicates from a tiny palette of prices.
    palette = [rng.randint(1, MAX_PRICE) for _ in range(min(5, n))]
    prices = [rng.choice(palette) for _ in range(n)]
    k = clamp_k(int(sum(prices) * rng.uniform(0.0, 1.1)))
    return prices, k


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    prices, k = build_case(seed, n, rng)
    assert len(prices) == n
    assert all(1 <= p <= MAX_PRICE for p in prices)
    assert 1 <= k <= MAX_K
    out = sys.stdout
    out.write(f"{n} {k}\n")
    out.write(" ".join(str(p) for p in prices))
    out.write("\n")


if __name__ == "__main__":
    main()
