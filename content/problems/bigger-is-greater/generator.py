"""Bigger is Greater -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed selects both the scale (small seeds produce a
handful of tiny words, large seeds push the word count and total length toward
the constraint ceilings) and the mix of word shapes, so the test set covers
degenerate cases (single letters, all-equal words, sorted and reverse-sorted
words, tiny alphabets that force long non-increasing suffixes) and not just
uniform noise.
"""

import random
import string
import sys

MAX_T = 100000
MAX_LEN = 100
MAX_TOTAL = 1000000


def make_word(rng: random.Random, length: int, shape: int) -> str:
    if shape == 0:
        # Uniform over the full alphabet.
        return "".join(rng.choice(string.ascii_lowercase) for _ in range(length))
    if shape == 1:
        # Single repeated letter: never has an answer.
        return rng.choice(string.ascii_lowercase) * length
    if shape == 2:
        # Sorted ascending: the smallest arrangement of its letters.
        return "".join(sorted(rng.choice(string.ascii_lowercase) for _ in range(length)))
    if shape == 3:
        # Sorted descending: the greatest arrangement, so no answer.
        return "".join(sorted((rng.choice(string.ascii_lowercase) for _ in range(length)), reverse=True))
    if shape == 4:
        # Tiny alphabet (2 letters): heavy duplicates, long equal runs.
        a, b = rng.sample(string.ascii_lowercase, 2)
        return "".join(rng.choice((a, b)) for _ in range(length))
    # shape == 5: ascending head, descending tail; the pivot sits mid-word.
    head = sorted(rng.choice(string.ascii_lowercase) for _ in range(length // 2))
    tail = sorted((rng.choice(string.ascii_lowercase) for _ in range(length - length // 2)), reverse=True)
    return "".join(head) + "".join(tail)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    if seed < 100:
        t = rng.randint(1, 20)
        max_len = rng.randint(1, 12)
    elif seed < 200:
        t = rng.randint(50, 2000)
        max_len = rng.randint(5, MAX_LEN)
    else:
        t = MAX_T
        max_len = MAX_LEN

    words = []
    total = 0
    for _ in range(t):
        length = rng.randint(1, max_len)
        if total + length > MAX_TOTAL:
            break
        shape = rng.randrange(6)
        words.append(make_word(rng, length, shape))
        total += length

    assert 1 <= len(words) <= MAX_T
    assert all(1 <= len(w) <= MAX_LEN and w.islower() and w.isalpha() for w in words)
    assert sum(len(w) for w in words) <= MAX_TOTAL

    out = sys.stdout
    out.write(f"{len(words)}\n")
    for w in words:
        out.write(w + "\n")


if __name__ == "__main__":
    main()
