"""The Coding Night Switchyard -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny yards; seeds of 448 and above
push n to the constraint ceiling. The seed also selects the shape of the
arrival permutation so the test set covers the interesting regimes (already
sorted, fully reversed, a single rotation that forces the worst answer,
near-sorted, sortable-by-blocks) and not just uniform shuffles.
"""

import random
import sys

MAX_N = 200000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 car, seed >= 448 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_arrivals(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform random permutation.
        cars = list(range(1, n + 1))
        rng.shuffle(cars)
        return cars

    if shape == 1:
        # Already in numeric order: every car rolls straight through.
        return list(range(1, n + 1))

    if shape == 2:
        # Fully reversed: the whole train passes through the siding at once,
        # which also maximises the siding's depth.
        return list(range(n, 0, -1))

    if shape == 3:
        # Rotation by one: car 1 arrives last, so everything else must wait in
        # the siding and the answer is 1 followed by n..2.
        return list(range(2, n + 1)) + [1]

    if shape == 4:
        # Near-sorted: identity with a sprinkling of random adjacent swaps.
        cars = list(range(1, n + 1))
        swaps = max(1, n // 20)
        for _ in range(swaps):
            i = rng.randrange(n - 1) if n > 1 else 0
            if n > 1:
                cars[i], cars[i + 1] = cars[i + 1], cars[i]
        return cars

    # shape == 5: ascending blocks, each reversed. Every block drains through
    # the siding in order, so the whole train is sortable and the yard runs
    # ON TIME at full scale.
    cars: list[int] = []
    value = 1
    while value <= n:
        block = min(rng.randint(1, 50), n - value + 1)
        cars.extend(range(value + block - 1, value - 1, -1))
        value += block
    return cars


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    cars = build_arrivals(seed, n, rng)
    assert len(cars) == n
    assert sorted(cars) == list(range(1, n + 1))
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(c) for c in cars))
    out.write("\n")


if __name__ == "__main__":
    main()
