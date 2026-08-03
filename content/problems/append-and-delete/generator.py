"""Append and Delete -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Length grows with the seed, and seed % 6 picks the shape
of the pair so the test set covers the decision boundaries (k exactly at the
minimum cost, one press over it, either side of the burn-everything threshold
|s| + |t|, identical strings, pure prefix relationships) rather than just
uniform noise, where random k is almost always a comfortable Yes or No.
"""

import random
import sys

MAX_LEN = 10 ** 4
MAX_K = 10 ** 9


def choose_len(seed: int) -> int:
    """Grow with the seed: small seeds tiny, seed >= 100 at the ceiling."""
    return max(1, min(MAX_LEN, seed * seed))


def rand_word(rng: random.Random, n: int, alphabet: str) -> str:
    return "".join(rng.choice(alphabet) for _ in range(n))


def build_pair(seed: int, n: int, rng: random.Random) -> tuple[str, str, int]:
    # A small alphabet forces accidental common prefixes; sometimes go wide.
    alphabet = rng.choice(["ab", "abcde", "abcdefghijklmnopqrstuvwxyz"])
    shape = seed % 6

    if shape == 0:
        # Independent random strings, k anywhere up to a bit past the burn line.
        s = rand_word(rng, rng.randint(1, n), alphabet)
        t = rand_word(rng, rng.randint(1, n), alphabet)
        k = rng.randint(1, len(s) + len(t) + 4)
        return s, t, k

    if shape == 1:
        # Identical strings: minimum cost is zero, everything rides on parity.
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
        # k straddling the burn-everything threshold |s| + |t|.
        s = rand_word(rng, rng.randint(1, n), alphabet)
        t = rand_word(rng, rng.randint(1, n), alphabet)
        k = max(1, len(s) + len(t) + rng.choice([-2, -1, 0, 1]))
        return s, t, k

    # shape == 5: enormous k, always Yes regardless of the strings.
    s = rand_word(rng, rng.randint(1, n), alphabet)
    t = rand_word(rng, rng.randint(1, n), alphabet)
    return s, t, MAX_K


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_len(seed)
    s, t, k = build_pair(seed, n, rng)
    assert 1 <= len(s) <= MAX_LEN and 1 <= len(t) <= MAX_LEN
    assert 1 <= k <= MAX_K
    assert s.islower() and t.islower()
    sys.stdout.write(f"{s}\n{t}\n{k}\n")


if __name__ == "__main__":
    main()
