"""Happy Ladybugs -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. seed % 6 selects the shape of the whole input:
  0 tiny boards (n <= 8), small alphabet, heavy on degenerate cases
  1 small boards (n <= 50), wider alphabet with empties
  2 letters-only boards (no empty cells): built happy runs, alternating
    patterns, and random noise, so the already-happy check is exercised
  3 adversarial: alternating colors, all one color, all empty, exactly one
    empty cell, planted singletons, pair soup
  4 large random boards, total cells pushed toward the ceiling
  5 maximum: a handful of full-size boards with distinct structures
"""

import random
import sys

MAX_N = 100000
MAX_TOTAL = 500000
MAX_G = 100
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def random_board(rng: random.Random, n: int, alphabet: str) -> str:
    return "".join(rng.choice(alphabet) for _ in range(n))


def happy_runs(rng: random.Random, n: int, colors: int) -> str:
    """Letters only, every run length >= 2, so the board is already happy."""
    parts: list[str] = []
    total = 0
    prev = ""
    while total < n - 1:
        ch = rng.choice([c for c in LETTERS[:colors] if c != prev])
        run = rng.randint(2, min(6, n - total)) if n - total >= 2 else 2
        parts.append(ch * run)
        total += run
        prev = ch
    board = "".join(parts)[:n]
    if len(board) < n:
        board += board[-1] * (n - len(board))
    # Repair a possible singleton tail created by the trim.
    if n >= 2 and board[-1] != board[-2]:
        board = board[:-1] + board[-2]
    return board


def adversarial_boards(rng: random.Random) -> list[str]:
    boards = [
        "ABAB" * 40,                       # counts fine, no empty, not happy
        "QQ" * 60,                          # single color, happy
        "_" * rng.randint(1, 200),          # no ladybugs at all
        "Z",                                # lone bug, no empty
        "Z_",                               # lone bug, empty available
        "".join(c * 2 for c in LETTERS) + "_",  # all 26 colors twice, one gap
        "AAB" + "_" * 5,                    # planted singleton with empties
        "A_A",                              # split pair rejoined via the gap
        happy_runs(rng, 300, 8),
        happy_runs(rng, 299, 5)[:-1] + "_",  # happy runs plus one empty
    ]
    pair_soup = [c for c in LETTERS[:10] for _ in range(2)]
    rng.shuffle(pair_soup)
    boards.append("".join(pair_soup) + "_")
    boards.append("".join(pair_soup))       # same soup, no empty: likely NO
    rng.shuffle(boards)
    return boards


def build(seed: int, rng: random.Random) -> list[str]:
    shape = seed % 6

    if shape == 0:
        return [
            random_board(rng, rng.randint(1, 8), rng.choice(["A_", "AB_", "AB", "A"]))
            for _ in range(rng.randint(20, 60))
        ]
    if shape == 1:
        return [
            random_board(rng, rng.randint(1, 50), rng.choice(["ABC_", "ABCDE_", "AB__"]))
            for _ in range(rng.randint(10, 40))
        ]
    if shape == 2:
        boards = []
        for _ in range(rng.randint(10, 30)):
            n = rng.randint(2, 400)
            kind = rng.randrange(3)
            if kind == 0:
                boards.append(happy_runs(rng, n, rng.randint(2, 12)))
            elif kind == 1:
                boards.append(("AB" * n)[:n])
            else:
                boards.append(random_board(rng, n, LETTERS[: rng.randint(2, 6)]))
        return boards
    if shape == 3:
        return adversarial_boards(rng)
    if shape == 4:
        boards = []
        budget = MAX_TOTAL - 20
        while budget > MAX_N and len(boards) < MAX_G - 1:
            n = rng.randint(MAX_N // 4, MAX_N)
            boards.append(random_board(rng, n, rng.choice(["AB_", LETTERS + "_", "ABC"])))
            budget -= n
        boards.append(random_board(rng, min(budget, MAX_N), "AB_"))
        return boards

    # shape == 5: five full-size boards, each a different structure.
    return [
        "_" * MAX_N,
        happy_runs(rng, MAX_N, 26),
        ("AB" * MAX_N)[:MAX_N],
        random_board(rng, MAX_N - 1, LETTERS[:6]) + "_",
        happy_runs(rng, MAX_N - 1, 4) + "Q",  # exactly one singleton, no empty
    ]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    boards = build(seed, rng)

    assert 1 <= len(boards) <= MAX_G
    assert sum(len(b) for b in boards) <= MAX_TOTAL
    for b in boards:
        assert 1 <= len(b) <= MAX_N
        assert all(c == "_" or "A" <= c <= "Z" for c in b)

    out = sys.stdout
    out.write(f"{len(boards)}\n")
    for b in boards:
        out.write(f"{len(b)}\n{b}\n")


if __name__ == "__main__":
    main()
