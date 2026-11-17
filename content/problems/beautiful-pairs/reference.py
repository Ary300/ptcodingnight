"""Beautiful Pairs -- reference solution.

The maximum number of disjoint beautiful pairs with no change is the sum over
each value v of min(count_a(v), count_b(v)): every matched pair consumes one
occurrence of v from each array, so per value the smaller count is both an
upper bound and achievable.

At most one element of b may then change, and leaving b alone is allowed:

- If the base matching already covers all n indices, nothing can improve it,
  so b is left alone. The answer is n.
- Otherwise some value of a is under-covered by b (and symmetrically some
  value of b is surplus). Changing one surplus element of b to an under-covered
  value of a gains exactly one pair, and a single change can never gain more
  than one. The answer is base + 1.
"""

import sys

MAX_VALUE = 100


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    b = [int(x) for x in data[1 + n:1 + 2 * n]]

    count_a = [0] * (MAX_VALUE + 1)
    count_b = [0] * (MAX_VALUE + 1)
    for value in a:
        count_a[value] += 1
    for value in b:
        count_b[value] += 1

    base = sum(min(count_a[v], count_b[v]) for v in range(1, MAX_VALUE + 1))

    print(n if base == n else base + 1)


if __name__ == "__main__":
    main()
