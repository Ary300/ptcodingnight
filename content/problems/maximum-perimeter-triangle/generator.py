"""Maximum Perimeter Triangle -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce small bins; seeds >= 100 hit the
n = 100 ceiling. The seed also selects a shape so that the test set covers
adversarial structures, not just uniform noise:

  0: uniform random lengths over the full value range
  1: every rod the same length
  2: Fibonacci-style growth, so no triple forms a triangle (answer -1)
  3: needle: Fibonacci giants hiding one small valid triple deep in the sort
  4: duplicate-heavy, values drawn from a tiny pool
  5: near-degenerate: many rods sitting exactly at or one off a + b = c

Lengths stop at 10^6, a casual-contest size: the largest perimeter is
3 * 10^6, so a + b, a + b + c and every comparison fit an int with room to
spare. A Fibonacci run under that cap is about 30 rods long, which is what
bounds the shape 2 and 3 bins. Which seed made which test: 15 = 10, 16 = 17,
17 = 28, 18 = 45, 19 = 64, 20 = 83, 22 = 102. The rest are written by hand:

  06: 1 1 MAX_L, flat at the ceiling (answer -1)
  07: three rods at MAX_L, the largest possible perimeter
  08: 100 rods at MAX_L
  11: the Fibonacci numbers 1, 1, 2, ... up to MAX_L, in order (answer -1)
  12: the same run shuffled, plus three 7s, so every triangle needs a 7 and
      the best one, 7 8 13, sits near the bottom of the sort
  21: MAX_L - 2, MAX_L - 1, MAX_L first, then 97 random lengths below them
"""

import random
import sys

MAX_N = 100
MAX_L = 10**6


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 3 -> 3 rods, seed >= 100 -> the ceiling."""
    return max(3, min(MAX_N, seed))


def fibonacci_run(rng: random.Random, limit: int) -> list[int]:
    """A run where each length >= sum of the previous two: no triangles."""
    run = [rng.randint(1, 3)]
    run.append(run[0] + rng.randint(0, 2))
    while len(run) < limit:
        nxt = run[-1] + run[-2] + rng.randint(0, 5)
        if nxt > MAX_L:
            break
        run.append(nxt)
    return run


def build_bin(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        return [rng.randint(1, MAX_L) for _ in range(n)]

    if shape == 1:
        length = rng.randint(1, MAX_L)
        return [length] * n

    if shape == 2:
        return fibonacci_run(rng, n)

    if shape == 3:
        small = rng.randint(1, 40)
        rods = [small, small + rng.randint(0, small - 1) if small > 1 else small,
                small + rng.randint(0, small - 1) if small > 1 else small]
        rods += fibonacci_run(rng, n - 3)
        rng.shuffle(rods)
        return rods[:n] if len(rods) >= 3 else rods

    if shape == 4:
        pool = [rng.randint(1, MAX_L) for _ in range(rng.randint(2, 5))]
        return [rng.choice(pool) for _ in range(n)]

    # shape == 5: clusters around exact degeneracy a + b = c.
    rods: list[int] = []
    while len(rods) < n:
        a = rng.randint(1, MAX_L // 3)
        b = rng.randint(a, MAX_L // 3)
        c = min(MAX_L, max(1, a + b + rng.choice([-1, 0, 1])))
        rods.extend([a, b, c])
    rods = rods[:n]
    rng.shuffle(rods)
    return rods


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    rods = build_bin(seed, n, rng)
    n = len(rods)
    assert 3 <= n <= MAX_N
    assert all(1 <= r <= MAX_L for r in rods)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(r) for r in rods))
    out.write("\n")


if __name__ == "__main__":
    main()
