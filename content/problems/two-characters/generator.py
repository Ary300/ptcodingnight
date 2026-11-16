"""Two Characters -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny strings; seeds >= 100 hit the
constraint ceiling. The seed also selects the shape of the string so the test
set covers degenerate cases (one letter only, doubled blocks that invalidate
every pair, a pure two-letter alternation where the whole string survives, all
26 letters in play) and not just uniform noise.

An untouched starter prints 0, so 0 is the answer only for the hand-picked edge
cases 03 (a sample), 04 (n = 1) and 10 (every letter doubled). The noisy and
degenerate shapes below each carry at least one planted alternation of two
letters the noise does not use, and the 26-letter shape plants two of different
lengths so a solution has to keep the longer one.

Which seed made which test: 06 = seed 2, 07 = 8, 12 = 6, 13 = 7, 14 = 20, 15 = 21,
16 = 22, 17 = 23, 20 = 106. The rest are written by hand.
"""

import random
import string
import sys

MAX_N = 10000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 character, seed >= 100 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def plant_alternation(rng: random.Random, base: list[str], pair: tuple[str, str], length: int) -> list[str]:
    """Overwrite `length` random slots of base, in order, with a, b, a, b, ...

    The two letters must not occur in base, so the alternation survives intact
    when everything else is deleted.
    """
    a, b = pair
    out = base[:]
    for rank, slot in enumerate(sorted(rng.sample(range(len(out)), length))):
        out[slot] = a if rank % 2 == 0 else b
    return out


def build_string(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 6

    if shape == 0 and n >= 4:
        # Uniform noise over a small alphabet, with a planted alternation of two
        # letters the noise never uses.
        pair = tuple(rng.sample(string.ascii_lowercase, 2))
        rest = [c for c in string.ascii_lowercase if c not in pair]
        letters = rng.sample(rest, min(len(rest), 2 + seed % 25))
        noise = [rng.choice(letters) for _ in range(n)]
        return "".join(plant_alternation(rng, noise, pair, rng.randint(2, max(2, n // 4))))

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

    if shape == 2 and n >= 2:
        # One letter almost everywhere, plus two lone stragglers. The dominant
        # letter repeats, so only the stragglers (and, in a short string, the
        # dominant letter between them) can form a pair.
        dominant, x, y = rng.sample(string.ascii_lowercase, 3)
        out = [dominant] * n
        i, j = sorted(rng.sample(range(n), 2))
        out[i], out[j] = x, y
        return "".join(out)

    if shape == 3 and n >= 4:
        # Letters emitted in doubled blocks, which invalidates most pairs, with a
        # planted alternation of two letters the blocks never use.
        pair = tuple(rng.sample(string.ascii_lowercase, 2))
        rest = [c for c in string.ascii_lowercase if c not in pair]
        out: list[str] = []
        while len(out) < n:
            ch = rng.choice(rest)
            out.extend((ch, ch))
        return "".join(plant_alternation(rng, out[:n], pair, rng.randint(2, max(2, n // 5))))

    if shape == 4 and n >= 8:
        # Many letters in play, the worst case for pair enumeration, with two
        # planted alternations of different lengths competing for the answer.
        p1 = rng.sample(string.ascii_lowercase, 2)
        rest = [c for c in string.ascii_lowercase if c not in p1]
        p2 = rng.sample(rest, 2)
        rest = [c for c in rest if c not in p2]
        noise = [rng.choice(rest) for _ in range(n)]
        long_len = rng.randint(n // 8, n // 4)
        short_len = rng.randint(2, max(2, long_len // 2))
        base = plant_alternation(rng, noise, (p1[0], p1[1]), long_len)
        free = [i for i, c in enumerate(base) if c not in p1]
        slots = sorted(rng.sample(free, short_len))
        for rank, slot in enumerate(slots):
            base[slot] = p2[rank % 2]
        return "".join(base)

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
