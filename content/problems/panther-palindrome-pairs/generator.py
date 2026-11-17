"""Panther Palindrome Pairs -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce a few tags: the ceiling on n climbs by 20 tags
per seed and reaches MAX_N at seed 50. From seed 1000 on, half the seeds use exactly MAX_N
tags. The seed also picks the shape of the pile so the test set covers a single tag, a pile
with no mirror pairs at all, a pile of identical palindromes (the answer is n choose 2, the
largest possible), tags from a two-letter alphabet where mirrors are common, and the biggest
pile the constraints allow.

The tests were made from these seeds (01 and 02 are the hand-written samples):

    03 <- 0     04 <- 1     05 <- 2     06 <- 3     07 <- 10    08 <- 18
    09 <- 120   10 <- 500   11 <- 900   12 <- 1000  13 <- 1004  14 <- 1006
    15 <- 1059  16 <- 1019

15 and 16 were seeds 1009 and 1010 when MAX_N was 20000. At the new ceiling those two both
came out as three-letter piles, so they were swapped for 1059 (1000 copies of `abbbba`, the
largest possible answer) and 1019 (1000 tags with no mirror pair at all).

MAX_N is 1000 so a casual contest's quadratic solution finishes well inside the time limit
and the largest answer, 1000 choose 2 = 499500, fits a 32-bit int with room to spare. It was
20000 once; the growth of 20 tags per seed is the old curve's slope, so tests 03 to 08 came
out byte-identical when the ceiling dropped.
"""

import random
import string
import sys

MAX_N = 1_000
GROWTH_PER_SEED = 20
FULL_SIZE_SEED = 1000
MAX_LEN = 10

LETTERS = string.ascii_lowercase


def random_tag(rng: random.Random, alphabet: str, max_len: int) -> str:
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(1, max_len)))


def build(rng: random.Random, n: int, shape: float) -> list[str]:
    if shape < 0.10:
        # Every tag identical and a palindrome: n choose 2 pairs.
        tag = random_tag(rng, "ab", 3)
        tag = tag + tag[::-1] if rng.random() < 0.5 else tag + tag[-2::-1]
        return [tag[:MAX_LEN]] * n
    if shape < 0.25:
        # Strictly increasing letters, so no tag is anyone's reverse and nothing repeats.
        tags = []
        for _ in range(n):
            length = rng.randint(2, MAX_LEN)
            letters = sorted(rng.sample(LETTERS, length))
            tags.append("".join(letters))
        return tags
    if shape < 0.45:
        # Two-letter alphabet, short tags: mirrors and palindromes everywhere.
        return [random_tag(rng, "ab", 3) for _ in range(n)]
    if shape < 0.65:
        # Planted mirrors: half the tags are the reverses of the other half, shuffled in.
        base = [random_tag(rng, LETTERS, MAX_LEN) for _ in range((n + 1) // 2)]
        tags = base + [t[::-1] for t in base]
        tags = tags[:n]
        rng.shuffle(tags)
        return tags
    if shape < 0.80:
        # Long tags from the full alphabet: almost no pairs by chance.
        return [random_tag(rng, LETTERS, MAX_LEN) for _ in range(n)]
    # Mixed lengths, small alphabet.
    return [random_tag(rng, "abc", MAX_LEN) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    ceiling = min(MAX_N, 1 + GROWTH_PER_SEED * seed)
    n = rng.randint(1, ceiling)
    if seed >= FULL_SIZE_SEED and rng.random() < 0.5:
        n = MAX_N
    tags = build(rng, n, rng.random())

    assert len(tags) == n
    assert all(1 <= len(tag) <= MAX_LEN and tag.isalpha() and tag.islower() for tag in tags)

    sys.stdout.write(f"{n}\n")
    sys.stdout.write(" ".join(tags) + "\n")


if __name__ == "__main__":
    main()
