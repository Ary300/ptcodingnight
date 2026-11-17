"""CamelCase -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short names; large seeds push the
length toward the 10^4 ceiling. The seed also selects the shape of the name so
the test set covers the degenerate cases (single letter, no uppercase at all,
every letter after the first uppercase, one-letter words, one huge word) and not
just uniform noise.

Which seed made which test (01-02 are the statement's examples and 03-04 are
hand-written: "a", the shortest name, and "aB", the shortest two-word name):

    05 seed 6    (36, one word)          12 seed 40   (1600, realistic words)
    06 seed 7    (49, all one-letter)    13 seed 75   (5625, rare uppercase)
    07 seed 8    (64, alternating)       14 seed 123  (ceiling, rare uppercase)
    08 seed 9    (81, rare uppercase)    15 seed 200  (ceiling, alternating)
    09 seed 10   (100, realistic words)  16 seed 318  (ceiling, one word)
    10 seed 11   (121, coin flip)        17 seed 319  (ceiling, all one-letter)
    11 seed 23   (529, coin flip)        18 seed 322  (ceiling, realistic words)

The ceiling is 10^4 characters so the largest file stays near 10 KB; a casual
contest does not need a 10^5-character name to test a linear scan.
"""

import random
import string
import sys

MAX_LEN = 10000


def choose_len(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 100 -> the ceiling."""
    return max(1, min(MAX_LEN, seed * seed))


def build_name(seed: int, length: int, rng: random.Random) -> str:
    shape = seed % 6

    if shape == 0 or length == 1:
        # One word: all lowercase, no uppercase anywhere.
        return "".join(rng.choice(string.ascii_lowercase) for _ in range(length))

    if shape == 1:
        # Maximum word count: every character after the first is uppercase,
        # so every word after the first is a single letter.
        first = rng.choice(string.ascii_lowercase)
        rest = "".join(rng.choice(string.ascii_uppercase) for _ in range(length - 1))
        return first + rest

    if shape == 2:
        # Strictly alternating case starting lowercase: aBcDeF...
        chars = []
        for i in range(length):
            if i % 2 == 0:
                chars.append(rng.choice(string.ascii_lowercase))
            else:
                chars.append(rng.choice(string.ascii_uppercase))
        return "".join(chars)

    if shape == 3:
        # A few long words: rare uppercase letters buried in lowercase runs.
        chars = [rng.choice(string.ascii_lowercase)]
        for _ in range(length - 1):
            if rng.random() < 0.02:
                chars.append(rng.choice(string.ascii_uppercase))
            else:
                chars.append(rng.choice(string.ascii_lowercase))
        return "".join(chars)

    if shape == 4:
        # Realistic camelCase: words of length 2..10 glued together.
        chars = [rng.choice(string.ascii_lowercase)]
        while len(chars) < length:
            word_len = min(rng.randint(2, 10), length - len(chars))
            chars.append(rng.choice(string.ascii_uppercase))
            for _ in range(word_len - 1):
                chars.append(rng.choice(string.ascii_lowercase))
        return "".join(chars[:length])

    # shape == 5: uniform coin flip per character (first forced lowercase).
    chars = [rng.choice(string.ascii_lowercase)]
    for _ in range(length - 1):
        pool = string.ascii_uppercase if rng.random() < 0.5 else string.ascii_lowercase
        chars.append(rng.choice(pool))
    return "".join(chars)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    length = choose_len(seed)
    name = build_name(seed, length, rng)
    assert len(name) == length
    assert name[0].islower()
    assert all(ch.isalpha() and ch.isascii() for ch in name)
    sys.stdout.write(name + "\n")


if __name__ == "__main__":
    main()
