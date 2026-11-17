"""Caesar Cipher -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short strings; large seeds push n to
the constraint ceiling of 10,000 characters, which keeps every file near 10 KB. The seed also selects the shape of the string (uniform
printable noise, letters only, wrap-boundary letters, no letters at all, one
repeated character) and the flavor of k (small, just past a full turn, a few
hundred, the 10^6 ceiling), so the test set covers the wrap-around and the k > 26 reduction and
not just typical text.

The identity answer (output equal to input) belongs to three hand-written edge
cases only: k = 0 (05), k = 26 (06) and a string with no letters (08). The
generated shapes all contain letters and every generated k has k mod 26 != 0, so a
program that echoes its input cannot pass them.

Which seed made which test: 04 = seed 1, 11 = 6, 12 = 12, 13 = 13, 14 = 19,
15 = 320, 17 = 322. The rest are written by hand. The two large hand-written
cases are the first 10,000 characters of a fixed pattern: 16 is random letters of
both cases with k = 161, and 18 cycles through every printable character from
code 33 to 126 with k = 999999, one below the ceiling.

k stays at or below 10^6, so k plus a character code fits comfortably in a 32-bit
int and nobody needs a long to shift a letter.
"""

import random
import string
import sys

MAX_N = 10000
MAX_K = 10**6

PRINTABLE = [chr(c) for c in range(33, 127)]
LETTERS = string.ascii_letters
BOUNDARY = "azAZbyBYzzZZ"
NON_LETTERS = [c for c in PRINTABLE if not c.isalpha()]


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 100 -> the ceiling."""
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
        # Mostly punctuation and digits with a sparse sprinkling of letters, and
        # at least one letter, so the few that must move are easy to miss.
        chars = [rng.choice(NON_LETTERS) if rng.random() < 0.9 else rng.choice(LETTERS) for _ in range(n)]
        chars[rng.randrange(n)] = rng.choice(LETTERS)
        return "".join(chars)

    # shape == 4: one letter repeated across the whole string.
    return rng.choice(LETTERS) * n


def choose_k(rng: random.Random) -> int:
    flavor = rng.randrange(6)
    if flavor == 0:
        return rng.randint(1, 25)
    if flavor == 1:
        return 26 * rng.randint(1, 5) + rng.randint(1, 25)  # just past a full turn
    if flavor == 2:
        return rng.randint(1, 25)
    if flavor == 3:
        return rng.randint(27, 1000)  # exceeds 26 but stays small
    if flavor == 4:
        return MAX_K
    k = rng.randint(1, MAX_K)
    return k if k % 26 != 0 else k - 1


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    s = build_string(seed, n, rng)
    k = choose_k(rng)
    assert len(s) == n
    assert all(33 <= ord(c) <= 126 for c in s)
    assert 0 <= k <= MAX_K
    assert k % 26 != 0 and any(c.isalpha() for c in s), "a generated case must not be the identity"
    out = sys.stdout
    out.write(f"{n}\n{s}\n{k}\n")


if __name__ == "__main__":
    main()
