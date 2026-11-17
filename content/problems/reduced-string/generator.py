"""Super Reduced String -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short strings; large seeds push
|s| to the constraint ceiling. The seed also selects the shape of the string
so the test set covers the degenerate cases (single character, one repeated
letter, no reduction at all, total reduction to empty, deeply nested
cancellations, tiny alphabets) and not just uniform noise.

Bounds are sized for a casual contest: |s| is at most 5,000, so the largest
input stays near 5 KB and the obvious brute force (find the first adjacent
pair, delete it, rescan from the left) finishes well inside the time limit.
That brute force is quadratic in the worst case, so the two shapes that make
it rescan far (nested palindromes, and noise over a tiny alphabet, where a
long stable prefix builds up) are kept smaller still: the nested palindrome
is capped at NESTED_MAX, and the "abc" test uses a mid-size seed.

tests/01-02 are the two statement samples. tests/03-10, 12 and 13 are
hand-built edge cases and medium strings (single letter, one pair, no pair,
odd and even runs of one letter, every letter doubled, alternating "ab", a
2,000-letter nested palindrome, 1,000 letters of noise, 5,000 letters of
"ab"). tests/11 and 14-18 come from this generator, with these seeds:

    11 <- 56     one letter, then a nested palindrome, 2,001 letters,
                 reduces to that one letter
    14 <- 46     "abc" noise, 2,116 letters, cascading cancellation
    15 <- 76     "ab" noise, 5,000 letters
    16 <- 71     doubled-letter blocks, 5,000 letters, reduces to empty
    17 <- 99     no adjacent pair over 26 letters, 5,000 letters, unchanged
    18 <- 72     uniform noise over 26 letters, 5,000 letters
"""

import random
import string
import sys

MAX_N = 5000
NESTED_MAX = 2000
ALPHABET = string.ascii_lowercase


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 71 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def no_adjacent_pairs(n: int, k: int, rng: random.Random) -> str:
    """A string with no two equal neighbors: nothing reduces."""
    letters = ALPHABET[:k]
    out = [rng.choice(letters)]
    for _ in range(n - 1):
        nxt = rng.choice(letters)
        while nxt == out[-1]:
            nxt = rng.choice(letters)
        out.append(nxt)
    return "".join(out)


def build(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full alphabet.
        return "".join(rng.choice(ALPHABET) for _ in range(n))

    if shape == 1:
        # One letter repeated: reduces to empty (even n) or one char (odd n).
        return rng.choice(ALPHABET) * n

    if shape == 2:
        # w + reverse(w): a fully nested palindrome, reduces to empty.
        # Every other block of seeds puts one extra letter in front, so the
        # same nesting unwinds completely and leaves exactly that letter.
        half = max(1, min(n, NESTED_MAX) // 2)
        w = "".join(rng.choice(ALPHABET) for _ in range(half))
        lead = rng.choice(ALPHABET) if (seed // 6) % 2 else ""
        return lead + w + w[::-1]

    if shape == 3:
        # No adjacent equal pair anywhere: the string is its own answer.
        return no_adjacent_pairs(n, 2 + seed % 25, rng)

    if shape == 4:
        # Tiny alphabet noise ("ab" or "abc"): heavy, cascading cancellation.
        letters = "abc"[: 2 + (seed // 6) % 2]
        return "".join(rng.choice(letters) for _ in range(n))

    # shape == 5: doubled-letter blocks, everything cancels in shallow layers.
    out: list[str] = []
    while len(out) < n:
        out.append(rng.choice(ALPHABET) * 2)
    return "".join(out)[:n]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    s = build(seed, n, rng)
    assert 1 <= len(s) <= MAX_N
    assert all(c in ALPHABET for c in s)
    sys.stdout.write(s + "\n")


if __name__ == "__main__":
    main()
