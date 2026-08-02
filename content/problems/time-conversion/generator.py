"""Time Conversion -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed selects a shape so the test set hits the
adversarial corners (hour 12 with each suffix, field boundaries 00 and 59,
the hours adjacent to the 12 wraparound) and not just uniform noise.
"""

import random
import sys


def build_time(seed: int, rng: random.Random) -> tuple[int, int, int, str]:
    shape = seed % 8

    if shape == 0:
        # Midnight-hour times: 12:xx:xxAM.
        return 12, rng.randint(0, 59), rng.randint(0, 59), "AM"
    if shape == 1:
        # Noon-hour times: 12:xx:xxPM.
        return 12, rng.randint(0, 59), rng.randint(0, 59), "PM"
    if shape == 2:
        # Hours adjacent to the wraparound: 01 and 11, either suffix.
        return rng.choice([1, 11]), rng.randint(0, 59), rng.randint(0, 59), rng.choice(["AM", "PM"])
    if shape == 3:
        # Minute and second pinned to a boundary.
        return rng.randint(1, 12), rng.choice([0, 59]), rng.choice([0, 59]), rng.choice(["AM", "PM"])
    if shape == 4:
        # Exact hours: mm and ss both zero.
        return rng.randint(1, 12), 0, 0, rng.choice(["AM", "PM"])
    if shape == 5:
        # All three fields equal, e.g. 07:07:07.
        v = rng.randint(1, 12)
        return v, v, v, rng.choice(["AM", "PM"])
    if shape == 6:
        # Last second before a suffix flip: 11:59:59.
        return 11, 59, 59, rng.choice(["AM", "PM"])
    # shape == 7: uniform over the whole input space.
    return rng.randint(1, 12), rng.randint(0, 59), rng.randint(0, 59), rng.choice(["AM", "PM"])


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    hour, minute, second, suffix = build_time(seed, rng)
    assert 1 <= hour <= 12
    assert 0 <= minute <= 59
    assert 0 <= second <= 59
    assert suffix in ("AM", "PM")
    sys.stdout.write(f"{hour:02d}:{minute:02d}:{second:02d}{suffix}\n")


if __name__ == "__main__":
    main()
