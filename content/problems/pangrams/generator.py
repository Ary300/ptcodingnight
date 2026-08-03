"""Pangrams -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short lines; large seeds push the
length toward the constraint ceiling. The seed also selects the shape of the
line so the test set covers the adversarial cases (guaranteed pangrams,
near-misses one letter short, single-character lines, all-space lines,
single-letter floods, exactly-26-letter pangrams) rather than only uniform
noise, under which random text of any length is almost never a pangram.
"""

import random
import string
import sys

MAX_LEN = 100000


def choose_len(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_LEN, seed * seed))


def random_case(rng: random.Random, ch: str) -> str:
    return ch.upper() if rng.random() < 0.5 else ch


def build_line(seed: int, length: int, rng: random.Random) -> str:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over letters and spaces, both cases.
        pool = string.ascii_letters + "    "
        return "".join(rng.choice(pool) for _ in range(length))

    if shape == 1:
        # Guaranteed pangram: one of each letter in random case, padded with
        # noise, then shuffled. Needs at least 26 characters.
        length = max(length, 26)
        chars = [random_case(rng, c) for c in string.ascii_lowercase]
        pool = string.ascii_letters + "  "
        chars.extend(rng.choice(pool) for _ in range(length - 26))
        rng.shuffle(chars)
        return "".join(chars)

    if shape == 2:
        # Near-miss: a would-be pangram with every trace of one letter removed
        # and replaced, so exactly 25 distinct letters appear.
        length = max(length, 26)
        missing = rng.choice(string.ascii_lowercase)
        keep = [c for c in string.ascii_lowercase if c != missing]
        chars = [random_case(rng, c) for c in keep]
        pool = "".join(keep) + "".join(c.upper() for c in keep) + "  "
        chars.extend(rng.choice(pool) for _ in range(length - len(chars)))
        rng.shuffle(chars)
        return "".join(chars)

    if shape == 3:
        # A single letter flooded across the whole line.
        ch = rng.choice(string.ascii_letters)
        return ch * length

    if shape == 4:
        # Spaces only (still a legal input line, never a pangram).
        return " " * length

    # shape == 5: exactly the 26 letters, no padding, shuffled, random case.
    chars = [random_case(rng, c) for c in string.ascii_lowercase]
    rng.shuffle(chars)
    return "".join(chars)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    length = choose_len(seed)
    line = build_line(seed, length, rng)
    assert 1 <= len(line) <= MAX_LEN
    assert all(ch == " " or ch.isascii() and ch.isalpha() for ch in line)
    sys.stdout.write(line)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
