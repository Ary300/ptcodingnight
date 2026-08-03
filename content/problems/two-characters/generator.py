"""Two Characters -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny strings; seeds >= 100 hit the
constraint ceiling. The seed also selects the shape of the string so the test
set covers degenerate cases (one letter only, doubled blocks that invalidate
every pair, a pure two-letter alternation where the whole string survives, all
26 letters in play) and not just uniform noise.
"""

import random
import string
import sys

MAX_N = 10000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 100 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_string(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over a small alphabet.
        k = 2 + seed % 25
        letters = rng.sample(string.ascii_lowercase, k)
        return "".join(rng.choice(letters) for _ in range(n))

    if shape == 1 and n >= 2:
        # A long two-letter alternation with other letters injected at random
        # positions; the injected letters usually break their own pairs.
        a, b = rng.sample(string.ascii_lowercase, 2)
        core_len = max(2, min(n, (3 * n) // 4))
        out = [(a if i % 2 == 0 else b) for i in range(core_len)]
        others = [c for c in string.ascii_lowercase if c not in (a, b)]
        for _ in range(n - core_len):
            out.insert(rng.randrange(len(out) + 1), rng.choice(others))
        return "".join(out)

    if shape == 2:
        # One letter only: no valid pair exists.
        return rng.choice(string.ascii_lowercase) * n

    if shape == 3:
        # Letters emitted in doubled blocks, which invalidates most pairs.
        out: list[str] = []
        while len(out) < n:
            ch = rng.choice(string.ascii_lowercase)
            out.extend((ch, ch))
        return "".join(out[:n])

    if shape == 4:
        # All 26 letters in play: the worst case for pair enumeration.
        return "".join(rng.choice(string.ascii_lowercase) for _ in range(n))

    if shape == 5 and n >= 2:
        # A pure two-letter alternation: the whole string is the answer.
        a, b = rng.sample(string.ascii_lowercase, 2)
        return "".join(a if i % 2 == 0 else b for i in range(n))

    # Fallback for n == 1 under shapes that need at least two characters.
    return rng.choice(string.ascii_lowercase)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    s = build_string(seed, n, rng)
    assert len(s) == n
    assert all(c in string.ascii_lowercase for c in s)
    sys.stdout.write(f"{n}\n{s}\n")


if __name__ == "__main__":
    main()
