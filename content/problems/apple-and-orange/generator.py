"""Random input generator for "Apple and Orange".

Usage: python3 generator.py <seed>

Prints one valid input to stdout. Deterministic for a given seed. Small seeds
produce small inputs; large seeds push toward the constraint ceiling. The seed
also selects a shape (general, all-equal offsets, all hits, all misses,
single-point tarp) so a spread of seeds covers the degenerate cases.
"""

import random
import sys

MAX_POS = 10 ** 7
MAX_OFFSET = 10 ** 7
MAX_COUNT = 10 ** 5


def size_for(seed):
    """Number of fruit per launcher grows with the seed."""
    if seed < 10:
        return 1, 6
    if seed < 100:
        return 1, 200
    if seed < 1000:
        return 100, 5000
    return MAX_COUNT - 100, MAX_COUNT


def span_for(rng, seed):
    """Pick the tarp ends, growing the coordinate range with the seed."""
    if seed < 10:
        ceiling = 20
    elif seed < 100:
        ceiling = 1000
    elif seed < 1000:
        ceiling = 10 ** 5
    else:
        ceiling = MAX_POS
    low = rng.randint(1, ceiling)
    high = rng.randint(1, ceiling)
    if low > high:
        low, high = high, low
    return low, high, ceiling


def clamp_offset(value):
    return max(-MAX_OFFSET, min(MAX_OFFSET, value))


def offsets_hitting(rng, origin, s, t, count):
    """Offsets whose landing points are guaranteed to be inside [s, t]."""
    return [rng.randint(s, t) - origin for _ in range(count)]


def offsets_missing(rng, origin, s, t, count):
    """Offsets whose landing points are guaranteed to be outside [s, t]."""
    result = []
    for _ in range(count):
        if s > 1 and rng.random() < 0.5:
            landing = rng.randint(1, s - 1)
        else:
            landing = t + rng.randint(1, 1000)
        result.append(clamp_offset(landing - origin))
    return result


def offsets_mixed(rng, origin, s, t, count):
    """Offsets that land near the tarp, so hits and misses are both common."""
    slack = max(1, (t - s) // 2 + 5)
    return [clamp_offset(rng.randint(s - slack, t + slack) - origin)
            for _ in range(count)]


def build_offsets(rng, mode, origin, s, t, count):
    if mode == 1:
        single = clamp_offset(rng.randint(s - 2, t + 2) - origin)
        return [single] * count
    if mode == 2:
        return offsets_hitting(rng, origin, s, t, count)
    if mode == 3:
        return offsets_missing(rng, origin, s, t, count)
    return offsets_mixed(rng, origin, s, t, count)


def main():
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    mode = seed % 5
    lo_count, hi_count = size_for(seed)
    s, t, ceiling = span_for(rng, seed)
    if mode == 4:
        t = s

    a = rng.randint(1, ceiling)
    b = rng.randint(1, ceiling)

    n = rng.randint(lo_count, hi_count)
    m = rng.randint(lo_count, hi_count)

    apples = build_offsets(rng, mode, a, s, t, n)
    oranges = build_offsets(rng, mode, b, s, t, m)

    lines = [
        "%d %d" % (s, t),
        "%d %d" % (a, b),
        "%d %d" % (n, m),
        " ".join(str(value) for value in apples),
        " ".join(str(value) for value in oranges),
    ]
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
