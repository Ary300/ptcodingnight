"""Deterministic input generator for circular-array-rotation.

Usage: python3 generator.py <seed>

The seed controls two independent things:
  * magnitude  -> input size (small seeds give tiny inputs, large seeds hit the ceiling)
  * seed % 8   -> which shape of input is produced (random, all-equal, k=0, ...)
"""

import random
import sys

N_MAX = 100000
Q_MAX = 100000
K_MAX = 10**9
A_MAX = 10**9


def size_ceiling(seed: int) -> int:
    """Map seed magnitude to the largest n/q this input is allowed to use."""
    s = abs(seed)
    if s < 10:
        return 5
    if s < 100:
        return 50
    if s < 1000:
        return 2000
    if s < 10000:
        return 20000
    return N_MAX


def main() -> None:
    if len(sys.argv) != 2:
        sys.stderr.write("usage: generator.py <seed>\n")
        raise SystemExit(1)

    seed = int(sys.argv[1])
    rnd = random.Random(seed)
    cap = size_ceiling(seed)
    mode = abs(seed) % 8

    # --- pick n, k, q and the value list according to the mode -------------
    if mode == 5:
        # degenerate ring: a single slot, every query must answer the same value
        n = 1
    elif mode == 7:
        n = min(2, cap)
    elif cap >= N_MAX:
        n = N_MAX
    else:
        n = rnd.randint(1, cap)

    q = min(Q_MAX, cap if cap >= N_MAX else rnd.randint(1, cap))

    if mode == 1:
        # every slot equally bright: rotation is invisible in the output
        fill = rnd.randint(0, A_MAX)
        values = [fill] * n
    elif mode == 2:
        # boundary values only
        values = [rnd.choice([0, A_MAX]) for _ in range(n)]
    else:
        values = [rnd.randint(0, A_MAX) for _ in range(n)]

    if mode == 2:
        k = 0                      # no ticks at all
    elif mode == 3:
        k = (K_MAX // n) * n       # an exact whole number of laps
    elif mode == 4:
        k = K_MAX                  # maximum ticks
    elif mode == 6:
        k = n - 1                  # one short of a full lap
    else:
        k = rnd.randint(0, K_MAX)

    if mode == 6:
        # every query hits the same slot
        target = rnd.randrange(n)
        queries = [target] * q
    else:
        queries = [rnd.randrange(n) for _ in range(q)]

    out = [f"{n} {k} {q}", " ".join(map(str, values))]
    out.extend(map(str, queries))
    sys.stdout.write("\n".join(out) + "\n")


main()
