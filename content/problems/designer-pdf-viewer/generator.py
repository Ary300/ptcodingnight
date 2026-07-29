"""Deterministic input generator for Designer PDF Viewer.

Usage: python3 generator.py <seed> > case.in

The seed controls both the random draw and the size: small seeds produce tiny
inputs and seeds at or above SIZE_CEILING produce inputs at the constraint
ceiling (seed // 5 is the size step). Seed % 5 selects a structural shape so
that degenerate cases (all-equal heights, minimum heights, maximum heights,
one-letter words, single-letter alphabets) are reachable as well as plain
random data.
"""

import random
import sys
import string

MAX_HEIGHT = 20
MAX_Q = 500
MAX_WORD_LEN = 500
SIZE_CEILING = 60
SIZE_STEPS = SIZE_CEILING // 5


def build_input(seed: int) -> str:
    rng = random.Random(seed)
    scale = min(1.0, max(0, seed) // 5 / SIZE_STEPS)
    shape = seed % 5

    q = max(1, int(round(MAX_Q * scale)))
    max_len = max(1, int(round(MAX_WORD_LEN * scale)))

    if shape == 1:
        # every letter the same height
        common = rng.randint(1, MAX_HEIGHT)
        heights = [common] * 26
    elif shape == 2:
        # minimum legal height everywhere
        heights = [1] * 26
    elif shape == 3:
        # maximum legal height everywhere
        heights = [MAX_HEIGHT] * 26
    elif shape == 4:
        # one very tall letter, everything else at the floor
        heights = [1] * 26
        heights[rng.randrange(26)] = MAX_HEIGHT
    else:
        heights = [rng.randint(1, MAX_HEIGHT) for _ in range(26)]

    if shape == 3:
        alphabet = string.ascii_lowercase
        lengths = [1] * q
    elif shape == 4:
        # words drawn from a tiny alphabet, so the tall letter is often absent
        alphabet = "".join(rng.sample(string.ascii_lowercase, 3))
        lengths = [rng.randint(1, max_len) for _ in range(q)]
    else:
        alphabet = string.ascii_lowercase
        lengths = [rng.randint(1, max_len) for _ in range(q)]

    if shape != 3:
        # always make at least one word sit at the current length ceiling
        lengths[rng.randrange(q)] = max_len

    lines = [" ".join(str(h) for h in heights), str(q)]
    for length in lengths:
        lines.append("".join(rng.choice(alphabet) for _ in range(length)))

    return "\n".join(lines) + "\n"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")
    seed = int(sys.argv[1])
    sys.stdout.write(build_input(seed))


if __name__ == "__main__":
    main()
