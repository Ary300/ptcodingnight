"""Super Reduced String -- definition-literal brute force.

Applies the statement's rule as written: while the string still contains some
adjacent equal pair, delete pairs and rescan. Each pass strips every doubled
letter with str.replace; deleting disjoint adjacent pairs is a valid sequence
of single reduction steps, and the reduction is confluent, so the fixpoint of
these passes is the unique fully reduced string. No stack, no single-pass
cleverness; the pass count depends on how deeply cancellations nest.
"""

import sys
import string


def main() -> None:
    s = sys.stdin.readline().strip()

    while True:
        before = s
        for c in string.ascii_lowercase:
            s = s.replace(c + c, "")
        if s == before:
            break

    print(s if s else "Empty String")


if __name__ == "__main__":
    main()
