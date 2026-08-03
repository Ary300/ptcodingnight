"""Separate the Numbers -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. seed % 6 selects the shape so the test set covers the
adversarial cases as well as noise: genuine consecutive chains starting from
1-digit and from 15-16 digit numbers (the 64-bit-adjacent range), chains that
roll over a power of ten (99 -> 100, 999999999999999 -> 1000000000000000),
chains corrupted in one digit, tapes with leading zeros, and pure random
digit strings. Larger seeds push the tape toward the 32-character ceiling.
"""

import random
import sys

MAX_LEN = 32


def build_chain(start: int, target_len: int) -> str:
    """Concatenate start, start+1, ... until adding another number would
    exceed MAX_LEN or the target length is reached. Always at least two
    numbers if they fit."""
    parts = [str(start)]
    total = len(parts[0])
    value = start
    while total < target_len:
        value += 1
        nxt = str(value)
        if total + len(nxt) > MAX_LEN:
            break
        parts.append(nxt)
        total += len(nxt)
    return "".join(parts)


def make_tape(seed: int, rng: random.Random) -> str:
    shape = seed % 6
    target_len = max(2, min(MAX_LEN, 2 + seed))

    if shape == 0:
        # Pure random digits.
        n = max(1, min(MAX_LEN, seed))
        return "".join(rng.choice("0123456789") for _ in range(n))

    if shape == 1:
        # Genuine chain with a small start.
        start = rng.randint(1, 999)
        return build_chain(start, target_len)

    if shape == 2:
        # Genuine chain starting just below a power of ten, so it rolls over.
        digits = rng.randint(2, 15)
        start = 10 ** digits - rng.randint(1, 3)
        return build_chain(start, target_len)

    if shape == 3:
        # Chain with exactly one digit mutated.
        start = rng.randint(1, 10 ** rng.randint(1, 12))
        s = list(build_chain(start, target_len))
        pos = rng.randrange(len(s))
        old = s[pos]
        choices = [c for c in "0123456789" if c != old]
        s[pos] = rng.choice(choices)
        return "".join(s)

    if shape == 4:
        # Leading zero in front of an otherwise genuine chain.
        start = rng.randint(1, 999)
        chain = build_chain(start, target_len - 1)
        return ("0" + chain)[:MAX_LEN]

    # shape == 5: genuine chain with a huge start (13 to 16 digit first number).
    digits = rng.randint(13, 16)
    start = rng.randint(10 ** (digits - 1), 10 ** digits - 1)
    return build_chain(start, MAX_LEN)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    tape = make_tape(seed, rng)
    assert 1 <= len(tape) <= MAX_LEN
    assert all(c in "0123456789" for c in tape)
    sys.stdout.write(tape + "\n")


if __name__ == "__main__":
    main()
