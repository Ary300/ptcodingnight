import sys

#
# Complete the 'diagonalDifference' function below.
#
# The function is expected to return an INTEGER.
# The function accepts following parameter(s):
#  1. 2D_INTEGER_ARRAY a
#
def diagonalDifference(a):
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
    a = [[_next_int() for _ in range(n)] for _ in range(n)]

    _out.append(str(diagonalDifference(a)) + "\n")

    sys.stdout.write("".join(_out))


main()
