"""Library Shelf Shuffle -- reference solution.

The cart is a stack. A positive event pushes a call number; a zero event pops the top one
and reports it, or reports `empty` when there is nothing to pop.
"""

import sys

EMPTY = "empty"


def shelf_shuffle(events):
    cart = []
    taken = []
    for e in events:
        if e > 0:
            cart.append(e)
        elif cart:
            taken.append(str(cart.pop()))
        else:
            taken.append(EMPTY)
    return taken


def main():
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    events = [int(t) for t in tokens[1 : 1 + n]]
    sys.stdout.write("\n".join(shelf_shuffle(events)) + "\n")


if __name__ == "__main__":
    main()
