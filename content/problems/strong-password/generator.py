"""Strong Password -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short passwords; large seeds push
the length to the constraint ceiling. The seed also selects the shape of the
password so that the test set covers the degenerate cases (single character,
one class only, exactly one class missing, already strong, length exactly at
the threshold) and not just uniform noise over all four classes.
"""

import random
import string
import sys

MAX_LEN = 100
MIN_LENGTH = 6
DIGITS = string.digits
LOWERS = string.ascii_lowercase
UPPERS = string.ascii_uppercase
SPECIALS = "!@#$%^&*()-+"
ALL_CLASSES = [DIGITS, LOWERS, UPPERS, SPECIALS]
ALPHABET = DIGITS + LOWERS + UPPERS + SPECIALS


def choose_len(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 10 -> the ceiling."""
    return max(1, min(MAX_LEN, seed * seed))


def build_password(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full alphabet.
        return "".join(rng.choice(ALPHABET) for _ in range(n))

    if shape == 1:
        # Every character from a single class.
        pool = rng.choice(ALL_CLASSES)
        return "".join(rng.choice(pool) for _ in range(n))

    if shape == 2:
        # Exactly one class missing (when length allows the other three).
        missing = rng.randrange(4)
        kept = [p for i, p in enumerate(ALL_CLASSES) if i != missing]
        chars = [rng.choice(kept[i % len(kept)]) for i in range(n)]
        rng.shuffle(chars)
        return "".join(chars)

    if shape == 3:
        # All four classes forced present (when n >= 4), rest random.
        chars = [rng.choice(p) for p in ALL_CLASSES][:n]
        chars += [rng.choice(ALPHABET) for _ in range(n - len(chars))]
        rng.shuffle(chars)
        return "".join(chars)

    if shape == 4:
        # Two classes only.
        a, b = rng.sample(ALL_CLASSES, 2)
        return "".join(rng.choice(a if rng.random() < 0.5 else b) for _ in range(n))

    # shape == 5: length pinned near the threshold, mixed classes.
    n = rng.randint(max(1, MIN_LENGTH - 2), MIN_LENGTH + 2)
    return "".join(rng.choice(ALPHABET) for _ in range(n))


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_len(seed)
    password = build_password(seed, n, rng)
    assert 1 <= len(password) <= MAX_LEN
    assert all(c in ALPHABET for c in password)
    sys.stdout.write(password + "\n")


if __name__ == "__main__":
    main()
