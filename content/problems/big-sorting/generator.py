"""Big Sorting -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Ordinary seeds pick a shape via seed % 8 and grow the
instance with the seed, so small seeds make tiny inputs suitable for stress
testing. Three reserved seeds produce the boundary tests:

  9001 -> a handful of enormous numerals splitting the 10^6-digit budget
  9002 -> a single numeral of exactly 10^6 digits
  9003 -> maximum n, with the digit budget spent on short numerals

Every numeral is emitted without leading zeros; the value zero is the single
digit 0. The generator asserts the constraint envelope before printing.
"""

import random
import sys

MAX_N = 200_000
MAX_TOTAL_DIGITS = 1_000_000
DIGITS = "0123456789"
NONZERO = "123456789"


def numeral(rng: random.Random, length: int) -> str:
    """A uniformly random numeral of exactly `length` digits, no leading zero."""
    if length == 1:
        return rng.choice(DIGITS)
    return rng.choice(NONZERO) + "".join(rng.choices(DIGITS, k=length - 1))


def numeric_key(s: str) -> tuple[int, str]:
    return (len(s), s)


def build_ordinary(seed: int, rng: random.Random) -> list[str]:
    n = max(1, min(MAX_N, (seed * seed) // 3))
    shape = seed % 8

    if shape == 0:
        # Uniform noise over short-to-medium lengths.
        return [numeral(rng, rng.randint(1, 24)) for _ in range(n)]

    if shape == 1:
        # Every line is the same numeral.
        return [numeral(rng, rng.randint(1, 40))] * n

    if shape == 2:
        # Already sorted ascending.
        return sorted((numeral(rng, rng.randint(1, 24)) for _ in range(n)), key=numeric_key)

    if shape == 3:
        # Reverse sorted.
        return sorted((numeral(rng, rng.randint(1, 24)) for _ in range(n)), key=numeric_key, reverse=True)

    if shape == 4:
        # Heavy duplicates: a small pool of distinct values, sampled with repetition.
        pool = [numeral(rng, rng.randint(1, 12)) for _ in range(max(1, min(5, n)))]
        return [rng.choice(pool) for _ in range(n)]

    if shape == 5:
        # Same length, long shared prefix, differences only near the end:
        # forces the equal-length comparison deep into the string.
        length = rng.randint(8, 30)
        prefix = numeral(rng, length - 2)
        return [prefix + "".join(rng.choices(DIGITS, k=2)) for _ in range(n)]

    if shape == 6:
        # Power-of-ten boundary trap: 9 vs 10, 99 vs 100, and near neighbors,
        # where plain lexicographic order disagrees with numeric order.
        pool: list[str] = []
        for k in range(1, 7):
            pool.append("9" * k)
            pool.append("1" + "0" * k)
            pool.append("1" + "0" * (k - 1) + "1")
        return [rng.choice(pool) for _ in range(n)]

    # shape == 7: a mix that always includes zero and single digits.
    values = [numeral(rng, rng.randint(1, 18)) for _ in range(n)]
    values[0] = "0"
    for i in range(1, min(n, 4)):
        values[i] = rng.choice(DIGITS)
    rng.shuffle(values)
    return values


def build_reserved(seed: int, rng: random.Random) -> list[str]:
    if seed == 9001:
        # Four enormous numerals splitting the digit budget.
        return [numeral(rng, MAX_TOTAL_DIGITS // 4) for _ in range(4)]

    if seed == 9002:
        # One numeral of exactly the maximum length.
        return [numeral(rng, MAX_TOTAL_DIGITS)]

    if seed == 9003:
        # Maximum n; spend the remaining budget on 1-5 digit numerals.
        lengths = [1] * MAX_N
        budget = MAX_TOTAL_DIGITS - MAX_N
        for i in range(MAX_N):
            extra = rng.randint(0, 4)
            take = min(extra, budget)
            lengths[i] += take
            budget -= take
            if budget == 0:
                break
        return [numeral(rng, length) for length in lengths]

    raise ValueError(f"unknown reserved seed {seed}")


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    if seed in (9001, 9002, 9003):
        values = build_reserved(seed, rng)
    else:
        values = build_ordinary(seed, rng)

    assert 1 <= len(values) <= MAX_N
    assert sum(len(v) for v in values) <= MAX_TOTAL_DIGITS
    assert all(v == "0" or (v[0] != "0" and v.isdigit()) for v in values)

    out = sys.stdout
    out.write(f"{len(values)}\n")
    out.write("\n".join(values))
    out.write("\n")


if __name__ == "__main__":
    main()
