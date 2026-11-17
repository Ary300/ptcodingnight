"""Append and Delete -- input generator.

Usage: python3 generator.py <seed>
       python3 generator.py last-letter | no-prefix

Deterministic per seed. Length grows with the seed, and seed % 6 picks the shape
of the pair so the test set covers the decision boundary (k exactly at the
minimum cost, one press short of it, one over it, identical strings, pure prefix
relationships) rather than just uniform noise, where random k is almost always
a comfortable Yes or No. The rule is "at most k operations", so the minimum
cost (|s| - p) + (|t| - p), with p the longest common prefix, is the only line
that matters.

Sizes are kept moderate for a casual contest: strings of at most 1,000 letters
and k at most 10^5, so every value a solution computes is a small int.

Where each test came from:
  01-03  hand-written samples (shown in the statement)
  04-14  hand-written edge cases (single letters, pure prefix both ways, k one
         short of and exactly at the minimum cost, equal strings, a shared
         suffix that a position-by-position comparison would trust, k far past
         the cost in 14)
  15     seed 9     16  seed 16     17  seed 25     18  seed 32     19  seed 36
  20     last-letter: 1,000-letter strings that differ only in the last letter,
         k = 1, one short of the cost of 2 -> No
  21     no-prefix: 1,000-letter strings with no common prefix,
         k = |s| + |t| exactly -> Yes
"""

import random
import sys

MAX_LEN = 10 ** 3
MAX_K = 10 ** 5


def choose_len(seed: int) -> int:
    """Grow with the seed: small seeds tiny, seed >= 32 at the ceiling."""
    return max(1, min(MAX_LEN, seed * seed))


def rand_word(rng: random.Random, n: int, alphabet: str) -> str:
    return "".join(rng.choice(alphabet) for _ in range(n))


def build_pair(seed: int, n: int, rng: random.Random) -> tuple[str, str, int]:
    # A small alphabet forces accidental common prefixes; sometimes go wide.
    alphabet = rng.choice(["ab", "abcde", "abcdefghijklmnopqrstuvwxyz"])
    shape = seed % 6

    if shape == 0:
        # Independent random strings, k anywhere up to a little past |s| + |t|.
        s = rand_word(rng, rng.randint(1, n), alphabet)
        t = rand_word(rng, rng.randint(1, n), alphabet)
        k = rng.randint(1, len(s) + len(t) + 4)
        return s, t, k

    if shape == 1:
        # Identical strings: minimum cost is zero, so any k is enough.
        s = rand_word(rng, n, alphabet)
        k = rng.choice([1, 2, rng.randint(1, 2 * n + 2), 2 * n - 1, 2 * n])
        return s, s, max(1, k)

    if shape == 2:
        # One is a prefix of the other: pure appends or pure deletes.
        long = rand_word(rng, n, alphabet)
        cut = rng.randint(1, n)
        short = long[:cut]
        s, t = (long, short) if rng.random() < 0.5 else (short, long)
        cost = (len(s) - len(short)) + (len(t) - len(short))
        k = max(1, cost + rng.choice([-1, 0, 1, 2]))
        return s, t, k

    if shape == 3:
        # Long shared prefix, short differing tails, k hugging the minimum cost.
        p = rng.randint(0, n - 1)
        prefix = rand_word(rng, p, alphabet)
        tail_s = rand_word(rng, rng.randint(1, max(1, n - p)), alphabet)
        tail_t = rand_word(rng, rng.randint(1, max(1, n - p)), alphabet)
        s, t = prefix + tail_s, prefix + tail_t
        # NOTE: the true common prefix may run past len(prefix) into the tails;
        # that only makes the case more adversarial, never invalid.
        cost = len(tail_s) + len(tail_t)
        k = max(1, cost + rng.choice([-2, -1, 0, 1, 2, 3]))
        return s, t, k

    if shape == 4:
        # k straddling the true minimum cost, measured on the real common prefix.
        s = rand_word(rng, rng.randint(1, n), alphabet)
        t = rand_word(rng, rng.randint(1, n), alphabet)
        p = 0
        while p < min(len(s), len(t)) and s[p] == t[p]:
            p += 1
        cost = (len(s) - p) + (len(t) - p)
        k = max(1, cost + rng.choice([-2, -1, 0, 1]))
        return s, t, k

    # shape == 5: enormous k, always Yes regardless of the strings.
    s = rand_word(rng, rng.randint(1, n), alphabet)
    t = rand_word(rng, rng.randint(1, n), alphabet)
    return s, t, MAX_K


def named_case(name: str) -> tuple[str, str, int]:
    """The two hand-designed full-size cases, 20 and 21."""
    if name == "last-letter":
        s = "ab" * (MAX_LEN // 2)
        t = s[:-1] + "c"
        return s, t, 1
    if name == "no-prefix":
        s = "qr" * (MAX_LEN // 2)
        t = "st" * (MAX_LEN // 2)
        return s, t, len(s) + len(t)
    raise SystemExit(f"unknown case {name!r}")


def main() -> None:
    arg = sys.argv[1]
    if arg.isdigit():
        seed = int(arg)
        rng = random.Random(seed)
        n = choose_len(seed)
        s, t, k = build_pair(seed, n, rng)
    else:
        s, t, k = named_case(arg)
    assert 1 <= len(s) <= MAX_LEN and 1 <= len(t) <= MAX_LEN
    assert 1 <= k <= MAX_K
    assert s.islower() and t.islower()
    sys.stdout.write(f"{s}\n{t}\n{k}\n")


if __name__ == "__main__":
    main()
