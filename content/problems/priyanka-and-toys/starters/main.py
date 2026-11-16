import sys

#
# Complete the 'minimumCrates' function below.
#
# The function is expected to return an INTEGER.
# The function accepts following parameter(s):
#  1. INTEGER_ARRAY weights
#
def minimumCrates(weights):
    # Write your code here
    return 0


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
    weights = [_next_int() for _ in range(n)]

    _out.append(str(minimumCrates(weights)))

    sys.stdout.write("\n".join(_out) + "\n")


main()
