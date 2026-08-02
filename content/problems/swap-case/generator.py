"""sWAP cASE -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short lines; seed >= 100 hits the
length ceiling. The seed also selects the shape of the line so the test set
covers letters-only text, letter-free text, characters that sit right next to
the letter ranges in ASCII ('@', '[', '`', '{'), long runs, and word-like text
with runs of internal spaces, not just uniform noise.
"""

import random
import string
import sys

MAX_LEN = 10000
PRINTABLE = [chr(c) for c in range(32, 127)]
NON_SPACE = [chr(c) for c in range(33, 127)]
NON_LETTERS = [ch for ch in NON_SPACE if not ch.isalpha()]
BOUNDARY = list("@[`{AZaz") + list("09 ")


def choose_len(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 100 -> the ceiling."""
    return max(1, min(MAX_LEN, seed * seed))


def build_line(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over all printable ASCII.
        chars = [rng.choice(PRINTABLE) for _ in range(n)]
    elif shape == 1:
        # Letters only, random case.
        chars = [rng.choice(string.ascii_letters) for _ in range(n)]
    elif shape == 2:
        # No letters at all: the whole line must pass through unchanged.
        chars = [rng.choice(NON_LETTERS + [" "]) for _ in range(n)]
    elif shape == 3:
        # Characters adjacent to the letter ranges in ASCII, to punish
        # off-by-one range checks.
        chars = [rng.choice(BOUNDARY) for _ in range(n)]
    elif shape == 4:
        # Long runs of a single character.
        chars = []
        while len(chars) < n:
            run = rng.randint(1, max(1, n // 10))
            chars.extend(rng.choice(PRINTABLE) * run)
        chars = chars[:n]
    else:
        # Word-like text with runs of internal spaces.
        chars = []
        while len(chars) < n:
            word_len = rng.randint(1, 12)
            chars.extend(rng.choice(string.ascii_letters) for _ in range(word_len))
            chars.extend(" " * rng.randint(1, 4))
        chars = chars[:n]

    # The constraints forbid leading and trailing spaces.
    if chars[0] == " ":
        chars[0] = rng.choice(NON_SPACE)
    if chars[-1] == " ":
        chars[-1] = rng.choice(NON_SPACE)
    return "".join(chars)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_len(seed)
    line = build_line(seed, n, rng)
    assert len(line) == n
    assert all(32 <= ord(ch) <= 126 for ch in line)
    assert line[0] != " " and line[-1] != " "
    sys.stdout.write(line)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
