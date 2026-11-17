"""Plus Minus -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny arrays; large seeds push n to
the constraint ceiling of 1,000. The seed also selects the shape of the array so
the test set covers degenerate cases (single element, one sign class only, an
entirely missing class, values pinned to the constraint bounds) and not just
uniform noise.

Values stay within +/- 1,000,000 and n within 1,000, so every input fits a
signed 32-bit int and the largest file is about 9 KB.

Which seed made which test (the rest are hand-written):

    01, 02   hand-written; the two samples shown in statement.md
    03       hand-written; n = 1, a single positive
    04       hand-written; n = 1, the negative bound
    05       hand-written; n = 1, a single zero
    06       seed 8    n = 64,   all positive
    07       seed 9    n = 81,   all negative
    08       seed 10   n = 100,  all zeros
    09       seed 12   n = 144,  only -MAX_ABS, 0 and MAX_ABS
    10       hand-written; no zeros, both bounds present
    11       hand-written; no positives
    12       hand-written; no negatives
    13       seed 35   n = 1000, uniform noise
    14       seed 53   n = 1000, zero-heavy mix
    15       seed 315  n = 1000, uniform noise
    16       seed 322  n = 1000, uniform noise
"""

import random
import sys

MAX_N = 1000
MAX_ABS = 10**6


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_values(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full value range, zeros included by chance.
        return [rng.randint(-MAX_ABS, MAX_ABS) for _ in range(n)]

    if shape == 1:
        # All positive.
        return [rng.randint(1, MAX_ABS) for _ in range(n)]

    if shape == 2:
        # All negative.
        return [rng.randint(-MAX_ABS, -1) for _ in range(n)]

    if shape == 3:
        # All zeros.
        return [0] * n

    if shape == 4:
        # Zero-heavy mix: roughly half the entries are exactly zero.
        values = []
        for _ in range(n):
            if rng.random() < 0.5:
                values.append(0)
            else:
                values.append(rng.randint(-MAX_ABS, MAX_ABS))
        return values

    if shape == 5:
        # Only the constraint bounds and zero appear.
        return [rng.choice([-MAX_ABS, 0, MAX_ABS]) for _ in range(n)]

    # shape == 6: small magnitudes, so sign flips are dense and zeros common.
    return [rng.randint(-3, 3) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    values = build_values(seed, n, rng)
    assert len(values) == n
    assert all(-MAX_ABS <= v <= MAX_ABS for v in values)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
