"""Find the Median -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny lists; large seeds push n
toward the constraint ceiling (99999, the largest odd n <= 10^5). The seed
also selects the shape of the list so the test set covers degenerate cases
(single element, all equal, already sorted, reverse sorted, values pinned to
the constraint bounds, heavy duplication around the middle) and not just
uniform noise.
"""

import random
import sys

MAX_N = 99999  # largest odd n within 1 <= n <= 10^5
MIN_VALUE = -(10 ** 6)
MAX_VALUE = 10 ** 6


def choose_n(seed: int, rng: random.Random) -> int:
    """Grow with the seed, always odd: seed 1 -> 1 element, big seeds -> ceiling."""
    raw = max(1, min(MAX_N, seed * seed))
    return raw if raw % 2 == 1 else raw - 1


def build_values(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full value range.
        return [rng.randint(MIN_VALUE, MAX_VALUE) for _ in range(n)]

    if shape == 1:
        # Every element identical, sometimes at a constraint bound.
        v = rng.choice([MIN_VALUE, MAX_VALUE, 0, rng.randint(MIN_VALUE, MAX_VALUE)])
        return [v] * n

    if shape == 2:
        # Already sorted ascending.
        vals = sorted(rng.randint(MIN_VALUE, MAX_VALUE) for _ in range(n))
        return vals

    if shape == 3:
        # Reverse sorted.
        return sorted(
            (rng.randint(MIN_VALUE, MAX_VALUE) for _ in range(n)), reverse=True
        )

    if shape == 4:
        # Tiny value alphabet: forces heavy duplication everywhere.
        alphabet = [rng.randint(MIN_VALUE, MAX_VALUE) for _ in range(3)]
        return [rng.choice(alphabet) for _ in range(n)]

    if shape == 5:
        # Both constraint bounds present, noise between them.
        vals = [MIN_VALUE, MAX_VALUE]
        vals += [rng.randint(MIN_VALUE, MAX_VALUE) for _ in range(n - 2)]
        vals = vals[:n]
        rng.shuffle(vals)
        return vals

    # shape == 6: a thick plateau of one value straddling the middle,
    # so the median falls inside a run of duplicates.
    plateau = rng.randint(MIN_VALUE, MAX_VALUE)
    run = max(1, n // 3)
    vals = [plateau] * run
    vals += [rng.randint(MIN_VALUE, plateau) for _ in range((n - run) // 2)]
    vals += [rng.randint(plateau, MAX_VALUE) for _ in range(n - len(vals))]
    rng.shuffle(vals)
    return vals


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    values = build_values(seed, n, rng)
    assert len(values) == n
    assert n % 2 == 1
    assert all(MIN_VALUE <= v <= MAX_VALUE for v in values)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
