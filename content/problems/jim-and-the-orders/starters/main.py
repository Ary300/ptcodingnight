import sys

#
# Complete the 'jimOrders' function below.
#
# The function is expected to return an INTEGER_ARRAY.
# The function accepts following parameter(s):
#  1. INTEGER_ARRAY t
#  2. INTEGER_ARRAY d
#
def jimOrders(t, d):
    # Write your code here
    return []


# ---------------------------------------------------------------------------
# Everything below reads the input and prints the answer.
# You do not need to change anything below this line.
# ---------------------------------------------------------------------------
_TOKENS = sys.stdin.read().split()
_POS = 0


def _next_token():
    global _POS
    token = _TOKENS[_POS]
    _POS += 1
    return token


def _next_int():
    return int(_next_token())


def main():
    _out = []

    n = _next_int()
    t = [0] * n
    d = [0] * n
    for _i in range(n):
        t[_i] = _next_int()
        d[_i] = _next_int()

    _out.append(" ".join(str(_e) for _e in jimOrders(t, d)))

    sys.stdout.write("\n".join(_out) + "\n")


main()
