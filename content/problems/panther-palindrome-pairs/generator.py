"""Panther Palindrome Pairs -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce a few tags; the size ceiling is reached once
the seed passes 1000. The seed also picks the shape of the pile so the test set covers a
single tag, a pile with no mirror pairs at all, a pile of identical palindromes (the
answer is n choose 2, the largest possible), tags from a two-letter alphabet where mirrors
are common, and the biggest pile the constraints allow.
"""

import random
import string
import sys

MAX_N = 20_000
MAX_LEN = 10

LETTERS = string.ascii_lowercase


def scale(seed: int) -> float:
    """0.0 for tiny seeds, 1.0 once the seed reaches 1000."""
    return min(seed, 1000) / 1000.0


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
    t = scale(seed)

    n = rng.randint(1, max(1, int(round(1 + t * (MAX_N - 1)))))
    if t >= 1.0 and rng.random() < 0.5:
        n = MAX_N
    tags = build(rng, n, rng.random())

    assert len(tags) == n
    assert all(1 <= len(tag) <= MAX_LEN and tag.isalpha() and tag.islower() for tag in tags)

    sys.stdout.write(f"{n}\n")
    sys.stdout.write(" ".join(tags) + "\n")


if __name__ == "__main__":
    main()
