"""Jumping on the Clouds: Revisited -- input generator.

Usage: python3 generator.py <seed>
       python3 generator.py alternating <n>

Deterministic per seed. Small seeds produce tiny circles; seeds >= 32 put n
at the ceiling of 1,000, which keeps every input under 2 KB and every answer
well inside a 32-bit int (the lowest possible is 100 - 1000 - 2 * 999 =
-2,898). The seed also selects the shape of the instance so the test set
covers the degenerate corners (minimum n, k = 1, k = n, k that does and does
not divide n, no thunderclouds at all, every cloud but 0 a thundercloud) and
not just uniform noise. Cloud 0 is always ordinary.

The `alternating` mode writes k = n over clouds 0 1 0 1 ..., a circle that is
half thunder but where the single jump lands straight back on cloud 0.

Which invocation made which test:

    01, 02            the two statement examples, hand-written
    03, 05 - 11       hand-written corners (n = 2, k = n, 100 and 101 jumps,
                      k dividing n, k coprime with n)
    04                seed 1    n = 2, k = 2
    12                seed 12   n = 144, k a divisor of n, sparse thunder
    13                seed 20   n = 400, k = 1, fifty-fifty noise
    14                seed 38   n = 1000, k coprime with n, sparse thunder
    15                seed 33   n = 1000, k coprime with n, all thunder
    16                alternating 1000
    17                seed 55   n = 1000, k = 1, all thunder (lowest answer)
    18                seed 44   n = 1000, random k, dense thunder
"""

import random
import sys

MAX_N = 1000
MIN_N = 2


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> tiny, seed >= 32 -> the ceiling."""
    return max(MIN_N, min(MAX_N, seed * seed))


def choose_k(shape: int, n: int, rng: random.Random) -> int:
    if shape == 0:
        return 1
    if shape == 1:
        return n
    if shape == 2:
        # A divisor of n, so only n/k clouds are ever visited.
        divisors = [d for d in range(1, n + 1) if n % d == 0]
        return rng.choice(divisors)
    if shape == 3:
        # Coprime with n where possible, so every cloud is visited.
        candidates = [k for k in range(1, n + 1) if _gcd(k, n) == 1]
        return rng.choice(candidates) if candidates else rng.randint(1, n)
    return rng.randint(1, n)


def _gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


def build_clouds(shape: int, n: int, rng: random.Random) -> list[int]:
    if shape == 0:
        # No thunderclouds at all.
        return [0] * n
    if shape == 1:
        # Every cloud except 0 is a thundercloud.
        return [0] + [1] * (n - 1)
    if shape == 2:
        # Sparse thunder.
        return [0] + [1 if rng.random() < 0.1 else 0 for _ in range(n - 1)]
    if shape == 3:
        # Dense thunder.
        return [0] + [1 if rng.random() < 0.9 else 0 for _ in range(n - 1)]
    # Fifty-fifty noise.
    return [0] + [rng.randint(0, 1) for _ in range(n - 1)]


def main() -> None:
    if sys.argv[1] == "alternating":
        n = int(sys.argv[2])
        k = n
        clouds = [i % 2 for i in range(n)]
    else:
        seed = int(sys.argv[1])
        rng = random.Random(seed)
        n = choose_n(seed)
        k = choose_k(seed % 5, n, rng)
        clouds = build_clouds((seed // 5) % 5, n, rng)

    assert MIN_N <= n <= MAX_N
    assert 1 <= k <= n
    assert clouds[0] == 0
    assert len(clouds) == n
    assert all(c in (0, 1) for c in clouds)

    out = sys.stdout
    out.write(f"{n} {k}\n")
    out.write(" ".join(str(c) for c in clouds))
    out.write("\n")


if __name__ == "__main__":
    main()
