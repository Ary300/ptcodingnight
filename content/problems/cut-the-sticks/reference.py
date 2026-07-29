"""Reference solution for "Cut the sticks".

Each pass cuts every remaining rod by the current shortest length, then rods of
length 0 are removed.  If we sort the rods once, the rods that disappear on a pass
are always a prefix of the sorted list, so we only need to walk that list forwards
while tracking how much has been cut off so far.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    rods = sorted(int(x) for x in data[1 : 1 + n])

    out = []
    cut_so_far = 0  # total length already removed from every surviving rod
    i = 0  # rods[0:i] have been scrapped
    while i < n:
        # n - i rods are still on the table before this pass.
        out.append(n - i)
        shortest = rods[i] - cut_so_far
        cut_so_far += shortest
        # Every rod whose original length equals cut_so_far is now zero.
        while i < n and rods[i] - cut_so_far == 0:
            i += 1

    sys.stdout.write("\n".join(map(str, out)) + "\n")


main()
