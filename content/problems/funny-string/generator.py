"""Funny String -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks how many strings the batch holds, how
long they run, and which shapes appear. Shapes cover the traps this task has:
palindromes (always funny), constructed funny strings that are NOT palindromes,
near-funny strings broken at exactly one mirrored jump pair, monotone runs,
alternating pairs, and uniform noise. Large seeds push every string to the
length ceiling.
"""

import random
import string
import sys

MAX_Q = 20
MAX_LEN = 100000
LO, HI = ord("a"), ord("z")


def walk_from_jumps(rng: random.Random, start: int, jumps: list[int]) -> str:
    """Build a string whose absolute adjacent jumps are exactly `jumps`."""
    codes = [start]
    for d in jumps:
        cur = codes[-1]
        options = [c for c in (cur + d, cur - d) if LO <= c <= HI]
        codes.append(rng.choice(options))
    return "".join(chr(c) for c in codes)


def funny_word(rng: random.Random, n: int) -> str:
    """Palindromic jump sequence, so funny, but rarely a palindrome itself."""
    half = [rng.randint(0, 4) for _ in range((n - 1 + 1) // 2)]
    jumps = (half + half[::-1])[: n - 1]
    # Keep the mirror exact for odd-length jump lists too.
    for i in range(n - 1):
        jumps[i] = jumps[min(i, n - 2 - i)]
    return walk_from_jumps(rng, rng.randint(LO + 4, HI - 4), jumps)


def is_funny(s: str) -> bool:
    b = s.encode("ascii")
    jumps = [abs(b[i] - b[i - 1]) for i in range(1, len(b))]
    return jumps == jumps[::-1]


def near_funny(rng: random.Random, n: int) -> str:
    """A funny word with one character nudged until the mirror breaks."""
    if n < 4:
        n = 4
    word = funny_word(rng, n)
    chars = list(word)
    for _ in range(200):
        i = rng.randrange(1, n - 1)
        old = chars[i]
        chars[i] = rng.choice(string.ascii_lowercase)
        if chars[i] != old and not is_funny("".join(chars)):
            return "".join(chars)
        chars[i] = old
    # Fallback: force a break that survives any mirror.
    chars[1] = "a" if chars[1] != "a" else "z"
    candidate = "".join(chars)
    return candidate if not is_funny(candidate) else candidate[:-1] + ("z" if candidate[-1] != "z" else "a")


def build_string(rng: random.Random, shape: int, n: int) -> str:
    if shape == 0:
        return "".join(rng.choice(string.ascii_lowercase) for _ in range(n))
    if shape == 1:
        half = [rng.choice(string.ascii_lowercase) for _ in range((n + 1) // 2)]
        return "".join(half + half[::-1])[:n] if n % 2 == 0 else "".join(half + half[-2::-1])
    if shape == 2:
        return funny_word(rng, n)
    if shape == 3:
        return near_funny(rng, n)
    if shape == 4:
        return rng.choice(string.ascii_lowercase) * n
    if shape == 5:
        start = rng.randint(0, 25)
        step = rng.choice([1, -1])
        return "".join(chr(LO + (start + step * i) % 26) for i in range(n))
    a, b = rng.sample(string.ascii_lowercase, 2)
    return "".join(a if i % 2 == 0 else b for i in range(n))


def choose_len(seed: int, rng: random.Random) -> int:
    if seed >= 900:
        return MAX_LEN
    if seed >= 400:
        return rng.randint(MAX_LEN // 2, MAX_LEN)
    return max(2, min(MAX_LEN, rng.randint(2, max(2, seed * seed))))


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    q = max(1, min(MAX_Q, 1 + seed % MAX_Q))
    words = []
    for k in range(q):
        n = choose_len(seed, rng)
        shape = (seed + k) % 7
        words.append(build_string(rng, shape, n))
    for w in words:
        assert 2 <= len(w) <= MAX_LEN
        assert all("a" <= ch <= "z" for ch in w)
    out = sys.stdout
    out.write(f"{q}\n")
    out.write("\n".join(words))
    out.write("\n")


if __name__ == "__main__":
    main()
