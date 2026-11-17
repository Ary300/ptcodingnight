"""Gemstones -- input generator.

Usage: python3 generator.py <seed> [--full]

Deterministic per seed. Small seeds produce tiny trays; large seeds push n and
the string lengths toward the constraint ceilings. The seed also selects the
shape of the tray so the test set covers degenerate cases (one rock, identical
rocks, disjoint alphabets, a single letter shared by everything, heavy
repetition inside one string) and not just uniform noise.

With --full, every rock is exactly MAX_LEN long and n is MAX_N, which is the
largest input the constraints allow. Each rock is drawn from its own 15-letter
alphabet: two letters chosen once for the whole tray are planted in every rock,
and the other 13 vary, so the answer is exactly 2.

The ceilings are sized for a casual contest: the largest tray is 100 rocks of
150 letters, about 15 KB, and every answer is at most 26.

Which command made which test:
  01, 02   hand-written samples (shown in statement.md)
  03       hand-written: one rock of one letter
  04       hand-written: one rock, a pangram repeated
  05       hand-written: two identical rocks, every letter distinct
  06       seed 43        07  seed 44        08  seed 41
  09, 10   hand-written: 100 one-letter rocks, all equal / cycling a..z
  11       seed 39        12  seed 46        13  seed 6
  14       seed 24        15  seed 48        16  seed 57
  17       seed 63
  18       seed 18 --full
"""

import random
import string
import sys

MAX_N = 100
MAX_LEN = 150
LETTERS = string.ascii_lowercase


def choose_n(seed: int, rng: random.Random) -> int:
    """Grow with the seed: tiny seeds give tiny trays, seed >= 60 hits the cap."""
    if seed >= 60:
        return MAX_N
    return max(1, min(MAX_N, rng.randint(1, max(1, seed * 2))))


def random_rock(rng: random.Random, alphabet: str, max_len: int) -> str:
    length = rng.randint(1, max_len)
    return "".join(rng.choice(alphabet) for _ in range(length))


def build_tray(seed: int, n: int, rng: random.Random) -> list[str]:
    max_len = MAX_LEN if seed >= 60 else max(1, min(MAX_LEN, seed * 20))
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full alphabet.
        return [random_rock(rng, LETTERS, max_len) for _ in range(n)]

    if shape == 1:
        # Every rock identical.
        rock = random_rock(rng, LETTERS, max_len)
        return [rock] * n

    if shape == 2:
        # Pairwise disjoint alphabets when possible: answer forced to 0 for n >= 2.
        pool = list(LETTERS)
        rng.shuffle(pool)
        chunk = max(1, len(pool) // max(2, n))
        rocks = []
        for i in range(n):
            lo = (i * chunk) % len(pool)
            alphabet = "".join(pool[lo:lo + chunk]) or pool[0]
            rocks.append(random_rock(rng, alphabet, max_len))
        return rocks

    if shape == 3:
        # Exactly one guaranteed shared letter buried in per-rock noise.
        shared = rng.choice(LETTERS)
        rest = [c for c in LETTERS if c != shared]
        rocks = []
        for _ in range(n):
            # One short of max_len, so planting the shared letter stays in bounds.
            body = random_rock(rng, "".join(rng.sample(rest, 8)), max(1, max_len - 1))
            pos = rng.randint(0, len(body))
            rocks.append(body[:pos] + shared + body[pos:])
        return rocks

    if shape == 4:
        # Heavy repetition: each rock is a few letters repeated many times.
        rocks = []
        for _ in range(n):
            alphabet = "".join(rng.sample(LETTERS, rng.randint(1, 3)))
            rocks.append(random_rock(rng, alphabet, max_len))
        return rocks

    # shape == 5: every rock contains the whole alphabet plus noise.
    rocks = []
    for _ in range(n):
        base = list(LETTERS)
        extra_len = rng.randint(0, max(0, max_len - len(base)))
        base.extend(rng.choice(LETTERS) for _ in range(extra_len))
        rng.shuffle(base)
        rocks.append("".join(base))
    return rocks


def full_tray(rng: random.Random) -> list[str]:
    """Largest input: MAX_N rocks of exactly MAX_LEN letters, 2 shared letters."""
    shared = rng.sample(LETTERS, 2)
    rest = [c for c in LETTERS if c not in shared]
    rocks = []
    for _ in range(MAX_N):
        alphabet = shared + rng.sample(rest, 13)
        rock = [rng.choice(alphabet) for _ in range(MAX_LEN)]
        for letter, pos in zip(shared, rng.sample(range(MAX_LEN), 2)):
            rock[pos] = letter
        rocks.append("".join(rock))
    return rocks


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    if "--full" in sys.argv[2:]:
        n = MAX_N
        tray = full_tray(rng)
    else:
        n = choose_n(seed, rng)
        tray = build_tray(seed, n, rng)
    assert len(tray) == n
    assert all(1 <= len(r) <= MAX_LEN for r in tray)
    assert all(all(c in LETTERS for c in r) for r in tray)
    out = sys.stdout
    out.write(f"{n}\n")
    for rock in tray:
        out.write(rock + "\n")


if __name__ == "__main__":
    main()
