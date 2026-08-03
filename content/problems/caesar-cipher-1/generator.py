"""Caesar Cipher -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short strings; large seeds push n to
the constraint ceiling. The seed also selects the shape of the string (uniform
printable noise, letters only, wrap-boundary letters, no letters at all, one
repeated character) and the flavor of k (zero, exact multiples of 26, small,
enormous), so the test set covers the wrap-around and the k > 26 reduction and
not just typical text.
"""

import random
import string
import sys

MAX_N = 100000
MAX_K = 10**9

PRINTABLE = [chr(c) for c in range(33, 127)]
LETTERS = string.ascii_letters
BOUNDARY = "azAZbyBYzzZZ"
NON_LETTERS = [c for c in PRINTABLE if not c.isalpha()]


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_string(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 5

    if shape == 0:
        # Uniform noise over every allowed character.
        return "".join(rng.choice(PRINTABLE) for _ in range(n))

    if shape == 1:
        # Letters only, both cases.
        return "".join(rng.choice(LETTERS) for _ in range(n))

    if shape == 2:
        # Heavy on the wrap boundary: a, z, A, Z and their neighbors.
        return "".join(rng.choice(BOUNDARY) for _ in range(n))

    if shape == 3:
        # No letters at all: the output must equal the input.
        return "".join(rng.choice(NON_LETTERS) for _ in range(n))

    # shape == 4: one character repeated across the whole string.
    return rng.choice(PRINTABLE) * n


def choose_k(rng: random.Random) -> int:
    flavor = rng.randrange(6)
    if flavor == 0:
        return 0
    if flavor == 1:
        return 26 * rng.randint(1, 5)  # identity in disguise
    if flavor == 2:
        return rng.randint(1, 25)
    if flavor == 3:
        return rng.randint(27, 1000)  # exceeds 26 but stays small
    if flavor == 4:
        return MAX_K
    return rng.randint(0, MAX_K)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    s = build_string(seed, n, rng)
    k = choose_k(rng)
    assert len(s) == n
    assert all(33 <= ord(c) <= 126 for c in s)
    assert 0 <= k <= MAX_K
    out = sys.stdout
    out.write(f"{n}\n{s}\n{k}\n")


if __name__ == "__main__":
    main()
