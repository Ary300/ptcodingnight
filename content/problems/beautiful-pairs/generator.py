"""Beautiful Pairs -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny arrays; large seeds push n to
the constraint ceiling. The seed also selects the shape of the pair of arrays
so the test set covers the adversarial cases (perfect multiset match, one
element away from perfect, disjoint value sets, one repeated value everywhere,
sorted against reverse sorted, duplicate-heavy tiny alphabets) and not just
uniform noise.
"""

import random
import sys

MAX_N = 100000
MAX_VALUE = 100


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> length 1, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_arrays(seed: int, n: int, rng: random.Random) -> tuple[list[int], list[int]]:
    shape = seed % 8

    if shape == 0:
        # Uniform noise over the full value range, independently per array.
        a = [rng.randint(1, MAX_VALUE) for _ in range(n)]
        b = [rng.randint(1, MAX_VALUE) for _ in range(n)]
        return a, b

    if shape == 1:
        # b is a shuffled copy of a: perfect multiset match, answer n - 1.
        a = [rng.randint(1, MAX_VALUE) for _ in range(n)]
        b = list(a)
        rng.shuffle(b)
        return a, b

    if shape == 2:
        # Disjoint value ranges: nothing matches, the one change buys 1 pair.
        half = MAX_VALUE // 2
        a = [rng.randint(1, half) for _ in range(n)]
        b = [rng.randint(half + 1, MAX_VALUE) for _ in range(n)]
        return a, b

    if shape == 3:
        # Identical arrays, element for element.
        a = [rng.randint(1, MAX_VALUE) for _ in range(n)]
        return a, list(a)

    if shape == 4:
        # One element away from perfect: a shuffled copy with one entry bent.
        a = [rng.randint(1, MAX_VALUE) for _ in range(n)]
        b = list(a)
        rng.shuffle(b)
        i = rng.randrange(n)
        b[i] = 1 + (b[i] % MAX_VALUE)  # guaranteed different value in range
        return a, b

    if shape == 5:
        # Duplicate-heavy: a tiny alphabet forces large per-value counts.
        alphabet = max(2, min(3, MAX_VALUE))
        a = [rng.randint(1, alphabet) for _ in range(n)]
        b = [rng.randint(1, alphabet) for _ in range(n)]
        return a, b

    if shape == 6:
        # Sorted a against reverse-sorted b over a narrow band of values.
        low = rng.randint(1, MAX_VALUE - 9)
        a = sorted(rng.randint(low, low + 9) for _ in range(n))
        b = sorted((rng.randint(low, low + 9) for _ in range(n)), reverse=True)
        return a, b

    # shape == 7: every element of both arrays is the same single value.
    value = rng.randint(1, MAX_VALUE)
    return [value] * n, [value] * n


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    a, b = build_arrays(seed, n, rng)
    assert len(a) == n and len(b) == n
    assert all(1 <= x <= MAX_VALUE for x in a)
    assert all(1 <= x <= MAX_VALUE for x in b)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(x) for x in a))
    out.write("\n")
    out.write(" ".join(str(x) for x in b))
    out.write("\n")


if __name__ == "__main__":
    main()
