"""Bill Division -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed selects both the size of the receipt and its
shape, so the test set covers the degenerate cases (two items, all-zero prices,
all-equal prices, the unshared item first or last, zero overcharge, maximal
overcharge, sorted and reverse-sorted receipts) and not just uniform noise.
Every emitted input satisfies the published constraints, including the
guarantee that the shared sum is even and that b is at least the fair charge.
"""

import random
import sys

MAX_N = 100000
MAX_PRICE = 10000
MAX_B = 10**9


def choose_n(seed: int, rng: random.Random) -> int:
    if seed % 11 == 0:
        return 2
    if seed % 7 == 0:
        return MAX_N
    return max(2, min(MAX_N, rng.randint(2, 2 + seed * seed)))


def build_prices(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6
    if shape == 0:
        return [rng.randint(0, MAX_PRICE) for _ in range(n)]
    if shape == 1:
        value = rng.randint(0, MAX_PRICE)
        return [value] * n
    if shape == 2:
        return sorted(rng.randint(0, MAX_PRICE) for _ in range(n))
    if shape == 3:
        return sorted((rng.randint(0, MAX_PRICE) for _ in range(n)), reverse=True)
    if shape == 4:
        # Heavy duplication from a tiny palette.
        palette = [rng.randint(0, MAX_PRICE) for _ in range(3)]
        return [rng.choice(palette) for _ in range(n)]
    # shape == 5: mostly zeros with a few spikes.
    prices = [0] * n
    for _ in range(max(1, n // 10)):
        prices[rng.randrange(n)] = rng.randint(1, MAX_PRICE)
    return prices


def choose_k(seed: int, n: int, rng: random.Random) -> int:
    placement = seed % 3
    if placement == 0:
        return 1
    if placement == 1:
        return n
    return rng.randint(1, n)


def make_shared_sum_even(prices: list[int], k: int) -> None:
    shared_sum = sum(prices) - prices[k - 1]
    if shared_sum % 2 == 0:
        return
    for i in range(len(prices)):
        if i == k - 1:
            continue
        if prices[i] < MAX_PRICE:
            prices[i] += 1
            return
        prices[i] -= 1
        return


def choose_b(seed: int, fair: int, rng: random.Random) -> int:
    mode = seed % 4
    if mode == 0:
        return fair  # exact split, answer is "Fair"
    if mode == 1:
        return min(MAX_B, fair + 1)  # smallest possible overcharge
    if mode == 2:
        return MAX_B  # maximal overcharge
    return rng.randint(fair, MAX_B)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    n = choose_n(seed, rng)
    prices = build_prices(seed, n, rng)
    k = choose_k(seed, n, rng)
    make_shared_sum_even(prices, k)

    shared_sum = sum(prices) - prices[k - 1]
    assert shared_sum % 2 == 0
    fair = shared_sum // 2
    b = choose_b(seed, fair, rng)

    assert 2 <= n <= MAX_N
    assert 1 <= k <= n
    assert all(0 <= p <= MAX_PRICE for p in prices)
    assert fair <= b <= MAX_B

    out = sys.stdout
    out.write(f"{n} {k}\n")
    out.write(" ".join(str(p) for p in prices))
    out.write("\n")
    out.write(f"{b}\n")


if __name__ == "__main__":
    main()
