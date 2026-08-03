"""Super Reduced String -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short strings; large seeds push
|s| to the constraint ceiling. The seed also selects the shape of the string
so the test set covers the degenerate cases (single character, one repeated
letter, no reduction at all, total reduction to empty, deeply nested
cancellations, tiny alphabets) and not just uniform noise.
"""

import random
import string
import sys

MAX_N = 100000
ALPHABET = string.ascii_lowercase


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 317 -> the ceiling."""
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
        half = max(1, n // 2)
        w = "".join(rng.choice(ALPHABET) for _ in range(half))
        return w + w[::-1]

    if shape == 3:
        # No adjacent equal pair anywhere: the string is its own answer.
        return no_adjacent_pairs(n, min(4, 1 + seed % 26), rng)

    if shape == 4:
        # Tiny alphabet noise: heavy, cascading cancellation.
        return "".join(rng.choice("ab") for _ in range(n))

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
