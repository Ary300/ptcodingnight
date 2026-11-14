"""Hall Pass Ledger -- reference solution.

One pass over the signatures with two dictionaries: the total so far per name, and the
minute of the open "out" signature for anyone currently in the hallway. A name that is in
the open dictionary is signing back in; a name that is not is signing out. Whoever is still
open at the end is charged up to the closing minute.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    closing = int(tokens[1])
    names = tokens[2 : 2 + n]
    minutes = [int(t) for t in tokens[2 + n : 2 + 2 * n]]

    total: dict[str, int] = {}
    out_since: dict[str, int] = {}

    for name, minute in zip(names, minutes):
        if name in out_since:
            total[name] += minute - out_since.pop(name)
        else:
            total.setdefault(name, 0)
            out_since[name] = minute

    for name, started in out_since.items():
        total[name] += closing - started

    lines = [f"{name} {total[name]}" for name in sorted(total)]
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
