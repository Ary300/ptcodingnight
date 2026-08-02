"""Electronics Shop -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny shops; large seeds push n and
m to the constraint ceiling. The seed also selects the shape of the price
lists so the test set covers degenerate cases (single item on each side,
everything over budget, everything affordable, an exact-fit pair planted in
noise, all prices equal, sorted and reverse-sorted lists) and not just
uniform noise.
"""

import random
import sys

MAX_N = 1000
MAX_M = 1000
MAX_PRICE = 10**6
MAX_BUDGET = 10**9


def choose_size(seed: int) -> tuple[int, int]:
    """Grow with the seed: seed 1 -> one of each, seed >= 32 -> the ceiling."""
    n = max(1, min(MAX_N, seed * seed))
    m = max(1, min(MAX_M, seed * seed))
    return n, m


def build_shop(seed: int, n: int, m: int,
               rng: random.Random) -> tuple[int, list[int], list[int]]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full price range, mid-range budget.
        keyboards = [rng.randint(1, MAX_PRICE) for _ in range(n)]
        drives = [rng.randint(1, MAX_PRICE) for _ in range(m)]
        b = rng.randint(2, 2 * MAX_PRICE)
        return b, keyboards, drives

    if shape == 1:
        # Every pair is over budget: the answer must be -1.
        lo = rng.randint(2, MAX_PRICE)
        keyboards = [rng.randint(lo, MAX_PRICE) for _ in range(n)]
        drives = [rng.randint(lo, MAX_PRICE) for _ in range(m)]
        b = 2 * lo - 1
        return b, keyboards, drives

    if shape == 2:
        # Huge budget: everything is affordable, answer is max + max.
        keyboards = [rng.randint(1, MAX_PRICE) for _ in range(n)]
        drives = [rng.randint(1, MAX_PRICE) for _ in range(m)]
        return MAX_BUDGET, keyboards, drives

    if shape == 3:
        # An exact-fit pair planted in noise: the answer should equal b.
        k_star = rng.randint(1, MAX_PRICE)
        d_star = rng.randint(1, MAX_PRICE)
        b = k_star + d_star
        keyboards = [rng.randint(1, MAX_PRICE) for _ in range(n)]
        drives = [rng.randint(1, MAX_PRICE) for _ in range(m)]
        keyboards[rng.randrange(n)] = k_star
        drives[rng.randrange(m)] = d_star
        return b, keyboards, drives

    if shape == 4:
        # All prices identical: n * m pairs, one possible total.
        price = rng.randint(1, MAX_PRICE)
        b = rng.choice([2 * price - 1, 2 * price, 2 * price + 1])
        return b, [price] * n, [price] * m

    if shape == 5:
        # Sorted ascending keyboards, reverse-sorted drives, tight budget.
        keyboards = sorted(rng.randint(1, MAX_PRICE) for _ in range(n))
        drives = sorted((rng.randint(1, MAX_PRICE) for _ in range(m)),
                        reverse=True)
        b = rng.randint(2, MAX_PRICE + MAX_PRICE // 2)
        return b, keyboards, drives

    # shape == 6: heavy duplicates from a tiny price alphabet.
    alphabet = [rng.randint(1, MAX_PRICE) for _ in range(min(5, MAX_PRICE))]
    keyboards = [rng.choice(alphabet) for _ in range(n)]
    drives = [rng.choice(alphabet) for _ in range(m)]
    b = rng.randint(2, 2 * MAX_PRICE)
    return b, keyboards, drives


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n, m = choose_size(seed)
    b, keyboards, drives = build_shop(seed, n, m, rng)

    assert 1 <= n <= MAX_N and 1 <= m <= MAX_M
    assert 1 <= b <= MAX_BUDGET
    assert all(1 <= k <= MAX_PRICE for k in keyboards)
    assert all(1 <= d <= MAX_PRICE for d in drives)

    out = sys.stdout
    out.write(f"{b} {n} {m}\n")
    out.write(" ".join(str(k) for k in keyboards))
    out.write("\n")
    out.write(" ".join(str(d) for d in drives))
    out.write("\n")


if __name__ == "__main__":
    main()
