"""Morgan and a String -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short strings; seeds of 100 and above
reach the constraint ceiling. The seed also selects a shape, so the test set covers
the adversarial cases for this task (long tie runs, one string a prefix of the
other, periodic strings out of phase, a difference hidden at the very end) and not
just uniform noise.
"""

import random
import string
import sys

MAX_LEN = 10000
ALPHABET = string.ascii_uppercase


def choose_len(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 100 -> the ceiling."""
    return max(1, min(MAX_LEN, seed * seed))


def build_pair(seed: int, la: int, rng: random.Random) -> tuple[str, str]:
    shape = seed % 7
    lb = max(1, min(MAX_LEN, rng.randint(max(1, la - la // 3), la)))

    if shape == 0:
        # Uniform noise over the full alphabet.
        a = "".join(rng.choice(ALPHABET) for _ in range(la))
        b = "".join(rng.choice(ALPHABET) for _ in range(lb))
        return a, b

    if shape == 1:
        # Two-letter alphabet: front characters tie constantly.
        pool = rng.sample(ALPHABET, 2)
        a = "".join(rng.choice(pool) for _ in range(la))
        b = "".join(rng.choice(pool) for _ in range(lb))
        return a, b

    if shape == 2:
        # Both strings are one repeated letter: every comparison runs to a sentinel.
        ch = rng.choice(ALPHABET)
        return ch * la, ch * lb

    if shape == 3:
        # Long shared prefix, then the two strings diverge into noise.
        cut = max(1, lb - lb // 8)
        prefix = "".join(rng.choice(ALPHABET) for _ in range(cut))
        tail_a = "".join(rng.choice(ALPHABET) for _ in range(la - cut))
        tail_b = "".join(rng.choice(ALPHABET) for _ in range(lb - cut))
        return prefix + tail_a, prefix + tail_b

    if shape == 4:
        # b is a proper prefix of a: the CA / C trap at scale.
        a = "".join(rng.choice(rng.sample(ALPHABET, 3)) for _ in range(la))
        lb2 = max(1, min(lb, la - 1)) if la > 1 else 1
        return a, a[:lb2]

    if shape == 5:
        # The same short period, out of phase between the two strings.
        period = "".join(rng.sample(ALPHABET, rng.randint(2, 4)))
        offset = rng.randint(1, len(period) - 1)
        a = (period * (la // len(period) + 2))[:la]
        b = (period * (lb // len(period) + 2))[offset:offset + lb]
        return a, b

    # shape == 6: identical runs with the only difference at the very end.
    ch = rng.choice(ALPHABET[:25])
    later = chr(ord(ch) + 1)
    a = ch * (la - 1) + later if la > 1 else ch
    b = ch * lb
    return a, b


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    la = choose_len(seed)
    a, b = build_pair(seed, la, rng)
    assert 1 <= len(a) <= MAX_LEN and 1 <= len(b) <= MAX_LEN
    assert all(c in ALPHABET for c in a) and all(c in ALPHABET for c in b)
    sys.stdout.write(a + "\n" + b + "\n")


if __name__ == "__main__":
    main()
