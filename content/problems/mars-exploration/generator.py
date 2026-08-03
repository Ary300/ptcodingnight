"""Mars Exploration -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short messages; large seeds push
the length to the constraint ceiling (99999, the largest multiple of 3 not
exceeding 10^5). The seed also selects the corruption shape so the test set
covers the degenerate cases (clean message, every character wrong, damage
confined to the S positions or to the O positions, corruption replaced by
letters that still belong to {S, O}) and not just uniform noise.
"""

import random
import string
import sys

MAX_LEN = 99999  # largest multiple of 3 that is <= 10^5
PATTERN = "SOS"


def choose_blocks(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 block, seed >= 183 -> the ceiling."""
    return max(1, min(MAX_LEN // 3, seed * seed))


def corrupt(expected: str, rng: random.Random) -> str:
    """Replace a character with a different uppercase letter."""
    choices = [c for c in string.ascii_uppercase if c != expected]
    return rng.choice(choices)


def build_message(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 6
    chars = [PATTERN[i % 3] for i in range(n)]

    if shape == 0:
        # Clean transmission: nothing altered.
        return "".join(chars)

    if shape == 1:
        # Every single character altered.
        return "".join(corrupt(c, rng) for c in chars)

    if shape == 2:
        # Uniform noise: each position altered with probability ~1/3.
        return "".join(
            corrupt(c, rng) if rng.random() < 1 / 3 else c for c in chars
        )

    if shape == 3:
        # Damage confined to the S positions (indices 0 and 2 of each block).
        return "".join(
            corrupt(c, rng) if i % 3 != 1 and rng.random() < 0.5 else c
            for i, c in enumerate(chars)
        )

    if shape == 4:
        # Damage confined to the O positions (index 1 of each block).
        return "".join(
            corrupt(c, rng) if i % 3 == 1 and rng.random() < 0.5 else c
            for i, c in enumerate(chars)
        )

    # shape == 5: corruption drawn only from {S, O}, so an S can arrive as an
    # O and vice versa. Catches solutions that count letters instead of
    # comparing positions.
    return "".join(
        ("O" if c == "S" else "S") if rng.random() < 0.4 else c for c in chars
    )


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = 3 * choose_blocks(seed)
    message = build_message(seed, n, rng)
    assert len(message) == n
    assert n % 3 == 0
    assert 3 <= n <= MAX_LEN
    assert all(c in string.ascii_uppercase for c in message)
    sys.stdout.write(message + "\n")


if __name__ == "__main__":
    main()
