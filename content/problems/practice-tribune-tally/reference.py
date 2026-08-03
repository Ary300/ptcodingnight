"""Tribune Tally -- reference solution.

Single pass over the ledger builds two hash maps keyed by word: the total number
of lines recording the word, and the set of distinct issue numbers those lines
mention. Each query is then an O(1) lookup. Overall O(n + q).
"""

import sys
from collections import defaultdict


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])

    totals: defaultdict[bytes, int] = defaultdict(int)
    issues: defaultdict[bytes, set[bytes]] = defaultdict(set)

    pos = 2
    for _ in range(n):
        issue = data[pos]
        word = data[pos + 1]
        pos += 2
        totals[word] += 1
        issues[word].add(issue)

    out = []
    for _ in range(q):
        word = data[pos]
        pos += 1
        if word in totals:
            out.append(f"{totals[word]} {len(issues[word])}")
        else:
            out.append("0 0")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
