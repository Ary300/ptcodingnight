"""Find Digits -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed selects both the batch size t and the shape of
the numbers, so the test set covers the degenerate cases (single digit, repdigits,
powers of ten, zero-heavy numbers, both constraint bounds) and not just uniform
noise.
"""

import random
import sys

MAX_T = 100
MAX_N = 10**9


def choose_t(seed: int, rng: random.Random) -> int:
    if seed % 7 == 0:
        return MAX_T
    if seed % 7 == 1:
        return 1
    return rng.randint(2, MAX_T)


def make_number(rng: random.Random, shape: int) -> int:
    if shape == 0:
        # Uniform over the whole range.
        return rng.randint(1, MAX_N)

    if shape == 1:
        # Single digit.
        return rng.randint(1, 9)

    if shape == 2:
        # Repdigit: the same nonzero digit repeated.
        d = rng.randint(1, 9)
        length = rng.randint(1, 10)
        n = int(str(d) * length)
        return min(n, MAX_N)

    if shape == 3:
        # Power of ten, or a power of ten minus one.
        p = rng.randint(0, 9)
        n = 10**p
        return n - 1 if rng.random() < 0.5 and n > 1 else n

    if shape == 4:
        # Zero-heavy: a few nonzero digits scattered among zeros.
        length = rng.randint(2, 10)
        digits = [str(rng.randint(1, 9))]
        for _ in range(length - 1):
            digits.append(str(rng.randint(1, 9)) if rng.random() < 0.3 else "0")
        return min(int("".join(digits)), MAX_N)

    # shape == 5: small numbers, where every digit matters.
    return rng.randint(1, 200)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    t = choose_t(seed, rng)
    numbers = [make_number(rng, rng.randint(0, 5)) for _ in range(t)]
    assert 1 <= t <= MAX_T
    assert all(1 <= n <= MAX_N for n in numbers)
    out = sys.stdout
    out.write(f"{t}\n")
    for n in numbers:
        out.write(f"{n}\n")


if __name__ == "__main__":
    main()
