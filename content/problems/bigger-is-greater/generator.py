"""Bigger is Greater -- input generator.

Usage: python3 generator.py <seed> [profile]

Deterministic per seed and profile. With the default profile, ``mixed``, the
seed selects both the scale (small seeds produce a handful of tiny words, large
seeds push the word count toward the ceiling, stopping at a total-length budget
that keeps the file near 20 KB) and the mix of word shapes, so the test set
covers degenerate cases (single letters, all-equal words, sorted and
reverse-sorted words, tiny alphabets that force long non-increasing suffixes)
and not just uniform noise.

The other profiles fix one shape of input at a moderate size:

    short   up to MAX_T words of at most 10 letters, uniform noise
    long    every word exactly MAX_LEN letters, all six shapes
    binary  up to MAX_T words of 1 to 19 letters, mostly over {a, b}

Which command made which test:

    01, 02      hand-written samples (statement.md)
    03 - 10     hand-written edge cases (one letter, two-letter pairs,
                all-equal words of every length, sorted and reverse-sorted
                words, tricky duplicates, a single word of MAX_LEN letters)
    11          generator.py 5
    12          generator.py 17
    13          generator.py 42
    14          generator.py 150
    15          generator.py 175
    16          generator.py 316 short
    17          generator.py 317 long
    18          generator.py 250
    19          generator.py 319 binary
"""

import random
import string
import sys

MAX_T = 1000
MAX_LEN = 100
# The statement allows MAX_T * MAX_LEN letters; the generator stays well under
# that so no single file is larger than about 20 KB.
TOTAL_BUDGET = 18000


def make_word(rng: random.Random, length: int, shape: int, alphabet: str = string.ascii_lowercase) -> str:
    if shape == 0:
        # Uniform over the full alphabet.
        return "".join(rng.choice(alphabet) for _ in range(length))
    if shape == 1:
        # Single repeated letter: never has an answer.
        return rng.choice(alphabet) * length
    if shape == 2:
        # Sorted ascending: the smallest arrangement of its letters.
        return "".join(sorted(rng.choice(alphabet) for _ in range(length)))
    if shape == 3:
        # Sorted descending: the greatest arrangement, so no answer.
        return "".join(sorted((rng.choice(alphabet) for _ in range(length)), reverse=True))
    if shape == 4:
        # Tiny alphabet (2 letters): heavy duplicates, long equal runs.
        a, b = rng.sample(alphabet, 2)
        return "".join(rng.choice((a, b)) for _ in range(length))
    # shape == 5: ascending head, descending tail; the pivot sits mid-word.
    head = sorted(rng.choice(alphabet) for _ in range(length // 2))
    tail = sorted((rng.choice(alphabet) for _ in range(length - length // 2)), reverse=True)
    return "".join(head) + "".join(tail)


def mixed_words(rng: random.Random, seed: int) -> list[str]:
    if seed < 100:
        t = rng.randint(1, 20)
        max_len = rng.randint(1, 12)
    elif seed < 200:
        t = rng.randint(50, 400)
        max_len = rng.randint(5, MAX_LEN)
    else:
        t = MAX_T
        max_len = MAX_LEN

    words = []
    total = 0
    for _ in range(t):
        length = rng.randint(1, max_len)
        if total + length > TOTAL_BUDGET:
            break
        shape = rng.randrange(6)
        words.append(make_word(rng, length, shape))
        total += length
    return words


def short_words(rng: random.Random) -> list[str]:
    return [make_word(rng, rng.choice((8, 9, 10, 10, 10)), 0) for _ in range(MAX_T)]


def long_words(rng: random.Random) -> list[str]:
    return [make_word(rng, MAX_LEN, rng.randrange(6)) for _ in range(TOTAL_BUDGET // MAX_LEN - 10)]


def binary_words(rng: random.Random) -> list[str]:
    words = []
    for _ in range(MAX_T):
        length = rng.randint(1, 19)
        alphabet = "ab" if rng.random() < 0.6 else string.ascii_lowercase
        words.append(make_word(rng, length, rng.randrange(6), alphabet))
    return words


def main() -> None:
    seed = int(sys.argv[1])
    profile = sys.argv[2] if len(sys.argv) > 2 else "mixed"
    rng = random.Random(seed)

    if profile == "mixed":
        words = mixed_words(rng, seed)
    elif profile == "short":
        words = short_words(rng)
    elif profile == "long":
        words = long_words(rng)
    elif profile == "binary":
        words = binary_words(rng)
    else:
        raise SystemExit(f"unknown profile: {profile}")

    assert 1 <= len(words) <= MAX_T
    assert all(1 <= len(w) <= MAX_LEN and w.islower() and w.isalpha() for w in words)
    assert sum(len(w) for w in words) <= TOTAL_BUDGET

    out = sys.stdout
    out.write(f"{len(words)}\n")
    for w in words:
        out.write(w + "\n")


if __name__ == "__main__":
    main()
