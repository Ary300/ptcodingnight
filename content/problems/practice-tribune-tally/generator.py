"""Tribune Tally -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny ledgers; seed >= 317 pushes
both n and q to the constraint ceiling. seed % 6 selects the ledger shape so
the test set covers degenerate cases (one word only, all-distinct words, a
dominant word, every query identical) and not just uniform noise. Seeds
divisible by 7 additionally force every word to the maximum length of 20.
"""

import random
import string
import sys

MAX_N = 100000
MAX_Q = 100000
MAX_ISSUE = 10**9
MAX_WORD_LEN = 20


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 line, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def make_word(rng: random.Random, fixed_len: bool) -> str:
    length = MAX_WORD_LEN if fixed_len else rng.randint(1, MAX_WORD_LEN)
    return "".join(rng.choice(string.ascii_lowercase) for _ in range(length))


def make_vocab(rng: random.Random, size: int, fixed_len: bool) -> list[str]:
    vocab: set[str] = set()
    while len(vocab) < size:
        vocab.add(make_word(rng, fixed_len))
    return sorted(vocab)


def absent_word(rng: random.Random, present: set[str], fixed_len: bool) -> str:
    while True:
        candidate = make_word(rng, fixed_len)
        if candidate not in present:
            return candidate


def pick_issue(rng: random.Random, pool: list[int]) -> int:
    """Mostly reuse a small pool of issues, occasionally roam the full range."""
    if rng.random() < 0.85:
        return rng.choice(pool)
    return rng.randint(1, MAX_ISSUE)


def build_case(seed: int, rng: random.Random) -> tuple[list[tuple[int, str]], list[str]]:
    n = choose_n(seed)
    q = max(1, min(MAX_Q, n))
    shape = seed % 6
    fixed_len = seed % 7 == 0
    issue_pool = sorted(rng.sample(range(1, MAX_ISSUE + 1), min(n, 200)))

    if shape == 1:
        # Every line is the same word in the same issue.
        word = make_word(rng, fixed_len)
        issue = rng.randint(1, MAX_ISSUE)
        ledger = [(issue, word)] * n
    elif shape == 2:
        # One word spread across as many distinct issues as possible.
        word = make_word(rng, fixed_len)
        picked = rng.sample(range(1, MAX_ISSUE + 1), n)
        ledger = [(issue, word) for issue in picked]
    elif shape == 3:
        # Every ledger line carries a distinct word.
        vocab = make_vocab(rng, n, fixed_len)
        ledger = [(pick_issue(rng, issue_pool), word) for word in vocab]
    elif shape == 4:
        # One dominant word buried in a long tail.
        vocab = make_vocab(rng, max(2, min(n, 500)), fixed_len)
        winner = vocab[0]
        ledger = []
        for _ in range(n):
            word = winner if rng.random() < 0.6 else rng.choice(vocab)
            ledger.append((pick_issue(rng, issue_pool), word))
    else:
        # Shapes 0 and 5: uniform noise over a modest vocabulary.
        vocab = make_vocab(rng, max(1, min(n, 1 + int(n**0.5))), fixed_len)
        ledger = [(pick_issue(rng, issue_pool), rng.choice(vocab)) for _ in range(n)]

    present = {word for _, word in ledger}
    present_list = sorted(present)

    if shape == 5:
        # Every query is the same word: worst case for a per-query rescan.
        queries = [rng.choice(present_list)] * q
    else:
        # Mix of hits, repeats, and guaranteed misses.
        queries = []
        for _ in range(q):
            if rng.random() < 0.7:
                queries.append(rng.choice(present_list))
            else:
                queries.append(absent_word(rng, present, fixed_len))

    rng.shuffle(ledger)
    return ledger, queries


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    ledger, queries = build_case(seed, rng)

    assert 1 <= len(ledger) <= MAX_N
    assert 1 <= len(queries) <= MAX_Q
    for issue, word in ledger:
        assert 1 <= issue <= MAX_ISSUE
        assert 1 <= len(word) <= MAX_WORD_LEN and word.islower() and word.isalpha()
    for word in queries:
        assert 1 <= len(word) <= MAX_WORD_LEN and word.islower() and word.isalpha()

    out = sys.stdout
    out.write(f"{len(ledger)} {len(queries)}\n")
    for issue, word in ledger:
        out.write(f"{issue} {word}\n")
    for word in queries:
        out.write(f"{word}\n")


if __name__ == "__main__":
    main()
