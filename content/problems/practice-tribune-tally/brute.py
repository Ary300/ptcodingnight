"""Tribune Tally -- brute force, definition-literal.

For every query it rescans the entire ledger, counting matching lines and
collecting their issue numbers, then counts distinct issues by sorting the
collected list and counting boundaries. O(n * q), no dictionary anywhere.

At the full constraints (n = q = 100000) this is ~10^10 comparisons and blows
the time limit by orders of magnitude; it exists to cross-check reference.py
on small inputs (stress testing and the small/medium test cases only).
"""

import sys


def distinct_sorted(values: list[str]) -> int:
    ordered = sorted(values)
    count = 0
    previous = None
    for value in ordered:
        if value != previous:
            count += 1
            previous = value
    return count


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    q = int(data[1])

    ledger = []
    pos = 2
    for _ in range(n):
        ledger.append((data[pos], data[pos + 1]))
        pos += 2

    out = []
    for _ in range(q):
        target = data[pos]
        pos += 1
        matched_issues = [issue for issue, word in ledger if word == target]
        out.append(f"{len(matched_issues)} {distinct_sorted(matched_issues)}")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
