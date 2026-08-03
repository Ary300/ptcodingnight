"""Panthers in a String -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short strings; large seeds push
string lengths toward the constraint ceiling. The seed also selects the
shape of the queries so the test set covers adversarial cases (target-letter
alphabets, planted subsequences, a letter missing entirely, repeated
almost-matches) rather than only uniform noise, where the answer is almost
always NO for short strings and YES for long ones.
"""

import random
import string
import sys

TARGET = "panthers"
MAX_LEN = 100000
MAX_Q = 20


def max_len_for(seed: int) -> int:
    """Grow with the seed: seed 1 -> tiny strings, seed >= 317 -> the ceiling."""
    return max(8, min(MAX_LEN, seed * seed))


def uniform(rng: random.Random, length: int) -> str:
    return "".join(rng.choice(string.ascii_lowercase) for _ in range(length))


def target_alphabet(rng: random.Random, length: int) -> str:
    """Only letters drawn from the target word: near misses are common."""
    return "".join(rng.choice(TARGET) for _ in range(length))


def planted(rng: random.Random, length: int) -> str:
    """Guaranteed YES: the target letters sit in order at random positions."""
    length = max(length, len(TARGET))
    slots = sorted(rng.sample(range(length), len(TARGET)))
    chars = [rng.choice(string.ascii_lowercase) for _ in range(length)]
    for slot, letter in zip(slots, TARGET):
        chars[slot] = letter
    return "".join(chars)


def missing_letter(rng: random.Random, length: int) -> str:
    """Guaranteed NO: one target letter never appears at all."""
    banned = rng.choice(TARGET)
    alphabet = [c for c in string.ascii_lowercase if c != banned]
    return "".join(rng.choice(alphabet) for _ in range(length))


def repeated_prefix(rng: random.Random, length: int) -> str:
    """Many almost-complete matches; the final letter may or may not arrive."""
    prefix = TARGET[: rng.randint(1, len(TARGET) - 1)]
    reps = max(1, length // len(prefix))
    body = (prefix * reps)[:length]
    if rng.random() < 0.5:
        body = body[:-1] + TARGET[-1]
    return body


SHAPES = [uniform, target_alphabet, planted, missing_letter, repeated_prefix]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    cap = max_len_for(seed)
    q = rng.randint(1, MAX_Q)
    queries = []
    for _ in range(q):
        shape = rng.choice(SHAPES)
        length = rng.randint(1, cap)
        s = shape(rng, length)
        assert 1 <= len(s) <= MAX_LEN
        assert all(c in string.ascii_lowercase for c in s)
        queries.append(s)
    out = sys.stdout
    out.write(f"{len(queries)}\n")
    for s in queries:
        out.write(s + "\n")


if __name__ == "__main__":
    main()
