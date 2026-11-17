"""Separate the Numbers -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. seed % 6 selects the shape so the test set covers the
adversarial cases as well as noise: genuine consecutive chains starting from
1-digit and from 3-4 digit numbers (the longest first number the tape allows,
since 9999 followed by 10000 is exactly nine digits), chains that roll over a
power of ten (99 -> 100, 9999 -> 10000), chains corrupted in one digit, chains
that skip a number, and pure random digit strings. Larger seeds push the tape
toward the 9-character ceiling. The tape never starts with 0, and at nine
digits every substring fits in a 32-bit int.
"""

import random
import sys

MAX_LEN = 9


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
        return rng.choice("123456789") + "".join(
            rng.choice("0123456789") for _ in range(n - 1)
        )

    if shape == 1:
        # Genuine chain with a small start.
        start = rng.randint(1, 999)
        return build_chain(start, target_len)

    if shape == 2:
        # Genuine chain starting just below a power of ten, so it rolls over.
        digits = rng.randint(1, 4)
        start = 10 ** digits - rng.randint(1, 3 if digits > 1 else 2)
        return build_chain(start, target_len)

    if shape == 3:
        # Chain with exactly one digit mutated.
        start = rng.randint(1, 10 ** rng.randint(1, 3))
        s = list(build_chain(start, target_len))
        pos = rng.randrange(len(s))
        old = s[pos]
        # The first digit is never mutated to 0, so the tape keeps its rule.
        pool = "123456789" if pos == 0 else "0123456789"
        choices = [c for c in pool if c != old]
        s[pos] = rng.choice(choices)
        return "".join(s)

    if shape == 4:
        # A chain that skips one number partway through: start, start + 1,
        # then start + 3. Every piece is a real number, so only the +1 check
        # can reject it.
        start = rng.randint(1, 99)
        parts = [str(start), str(start + 1), str(start + 3)]
        return "".join(parts)[:MAX_LEN]

    # shape == 5: genuine chain with a long start (3 to 4 digit first number).
    # The start stays two below the next power of ten so start + 1 keeps the same
    # digit count and both numbers fit on the tape.
    digits = rng.randint(3, 4)
    start = rng.randint(10 ** (digits - 1), 10 ** digits - 2)
    return build_chain(start, MAX_LEN)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    tape = make_tape(seed, rng)
    assert 1 <= len(tape) <= MAX_LEN
    assert all(c in "0123456789" for c in tape)
    assert tape[0] != "0"
    sys.stdout.write(tape + "\n")


if __name__ == "__main__":
    main()
