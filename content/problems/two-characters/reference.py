"""Two Characters -- reference solution.

For every pair of distinct letters that actually appear in the string, strip
every other letter with str.translate (C speed) and accept the survivor if it
contains no doubled character; with only two distinct letters left, "no doubled
character" is exactly "alternates". The answer is the longest accepted survivor
over all pairs, or 0 when no pair survives.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    s = data[1] if len(data) > 1 else ""
    assert len(s) == n

    present = sorted(set(s))
    best = 0
    for i, a in enumerate(present):
        for b in present[i + 1:]:
            keep = {ord(a), ord(b)}
            table = dict.fromkeys(
                (code for code in map(ord, present) if code not in keep)
            )
            t = s.translate(table)
            if a + a not in t and b + b not in t:
                # Both letters are present in s by construction, so t contains
                # exactly two distinct letters and alternates.
                best = max(best, len(t))
    print(best)


if __name__ == "__main__":
    main()
