import random
import string
import sys

MAX_N = 100
MAX_KEY = 20
MAX_MSG = 2000

LETTERS = string.ascii_lowercase


def scale(seed):
    """0.0 for tiny seeds, 1.0 once the seed reaches 1000."""
    return min(seed, 1000) / 1000.0


def pick_key(rng, t):
    shape = rng.random()
    if shape < 0.12:
        return "a"
    if shape < 0.28:
        # all-equal keyword letters: column order stays the original order
        letter = rng.choice(LETTERS)
        length = max(1, int(round(1 + t * (MAX_KEY - 1))))
        return letter * length
    if shape < 0.42:
        # keyword drawn from a tiny alphabet: lots of ties to break by index
        length = max(1, int(round(1 + t * (MAX_KEY - 1))))
        return "".join(rng.choice("ab") for _ in range(length))
    length = rng.randint(1, max(1, int(round(1 + t * (MAX_KEY - 1)))))
    return "".join(rng.choice(LETTERS) for _ in range(length))


def pick_message(rng, t, key):
    ceiling = max(1, int(round(1 + t * (MAX_MSG - 1))))
    shape = rng.random()
    if shape < 0.10:
        length = 1
    elif shape < 0.25:
        # exact multiple of the keyword length: no padding at all
        rows = rng.randint(1, max(1, ceiling // len(key)))
        length = min(MAX_MSG, rows * len(key))
    elif shape < 0.35:
        # one character short of a full rectangle: maximum padding minus one
        length = min(MAX_MSG, max(1, len(key) * rng.randint(1, 3) + 1))
    elif shape < 0.45:
        length = ceiling
    else:
        length = rng.randint(1, ceiling)
    alphabet = LETTERS if rng.random() < 0.75 else "ab"
    return "".join(rng.choice(alphabet) for _ in range(length))


def main():
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    t = scale(seed)

    n = rng.randint(1, max(1, int(round(1 + t * (MAX_N - 1)))))
    lines = [str(n)]
    for _ in range(n):
        key = pick_key(rng, t)
        lines.append(key)
        lines.append(pick_message(rng, t, key))
    sys.stdout.write("\n".join(lines) + "\n")


main()
