"""Panthers in a String -- input generator.

Usage: python3 generator.py <seed>
       python3 generator.py <case>

Deterministic per argument. With a numeric seed, small seeds produce short
strings and larger seeds push string lengths toward the per-string ceiling
of the seeded tests. The seed also selects the shape of the queries so the
test set covers adversarial cases (target-letter alphabets, planted
subsequences, a letter missing entirely, repeated almost-matches) rather
than only uniform noise, where the answer is almost always NO for short
strings and YES for long ones.

With a case name, the generator writes one of the hand-designed stress
shapes below. Every case is deterministic and keeps the whole file within
the total-length bound, so the largest test is about 20 KB.

Tests, by origin:
  01, 02            samples, shown in statement.md (hand-written)
  03, 04, 05, 06    hand-written edge cases: a single letter, the bare word,
                    reversed and near-miss spellings, all-one-letter strings
  07 = repeats      long runs of near-matches: the word with its last letter
                    only at the very end, never, at the very start, and a
                    run of "panthe" that never reaches "r"
  08 = missing      three noise strings that each lack one target letter
  09 = 9            10 = 23           11 = 120
  12 = 240          13 = 331
  14 = noise        ten uniform noise strings, every answer YES
  15 = extremes     "pa" repeated, the word with its "s" only at the end,
                    target-letter noise, and the word at each far end of a
                    run of "z"
  16 = mixed        twenty strings mixing every shape above

Bounds: q <= 20, 1 <= |s| <= 10000, and the total length of all query
strings in one file is at most 20000.
"""

import random
import string
import sys

TARGET = "panthers"
MAX_LEN = 10000
MAX_TOTAL = 20000
MAX_Q = 20
SEEDED_MAX_LEN = 1000


def max_len_for(seed: int) -> int:
    """Grow with the seed: seed 1 -> tiny strings, seed >= 32 -> the ceiling."""
    return max(8, min(SEEDED_MAX_LEN, seed * seed))


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
    return without_letter(rng, length, banned)


def without_letter(rng: random.Random, length: int, banned: str) -> str:
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


def seeded(seed: int) -> list:
    rng = random.Random(seed)
    cap = max_len_for(seed)
    q = rng.randint(1, MAX_Q)
    queries = []
    for _ in range(q):
        shape = rng.choice(SHAPES)
        length = rng.randint(1, cap)
        queries.append(shape(rng, length))
    return queries


def case_repeats() -> list:
    return [
        "panther" * 600 + "s",
        "panther" * 600,
        "spanther" * 500,
        "panthe" * 600,
    ]


def case_missing() -> list:
    rng = random.Random(8)
    return [without_letter(rng, 6000, banned) for banned in "phs"]


def case_noise() -> list:
    rng = random.Random(14)
    return [uniform(rng, rng.randint(1900, 2000)) for _ in range(10)]


def case_extremes() -> list:
    rng = random.Random(15)
    return [
        "pa" * 1500,
        "panther" * 428 + "s",
        target_alphabet(rng, 3000),
        "z" * 2992 + TARGET,
        TARGET + "z" * 2992,
    ]


def case_mixed() -> list:
    rng = random.Random(16)
    length = 950
    queries = []
    for banned, last in [("s", "panth"), ("a", "panth"), ("h", "p"), ("n", "pants")]:
        queries.append(uniform(rng, length))
        queries.append(target_alphabet(rng, length))
        queries.append(uniform(rng, length))
        queries.append(without_letter(rng, length, banned))
        if last == "p":
            queries.append("p" * length)
        elif last == "pants":
            queries.append("panth" * (length // 5 - 1) + "pants")
        else:
            queries.append("panth" * (length // 5))
    return queries


CASES = {
    "repeats": case_repeats,
    "missing": case_missing,
    "noise": case_noise,
    "extremes": case_extremes,
    "mixed": case_mixed,
}


def main() -> None:
    arg = sys.argv[1]
    queries = CASES[arg]() if arg in CASES else seeded(int(arg))
    assert 1 <= len(queries) <= MAX_Q
    assert sum(len(s) for s in queries) <= MAX_TOTAL
    for s in queries:
        assert 1 <= len(s) <= MAX_LEN
        assert all(c in string.ascii_lowercase for c in s)
    out = sys.stdout
    out.write(f"{len(queries)}\n")
    for s in queries:
        out.write(s + "\n")


if __name__ == "__main__":
    main()
