import sys

#
# Complete the 'luckBalance' function below.
#
# The function is expected to return an INTEGER.
# The function accepts following parameter(s):
#  1. INTEGER k
#  2. INTEGER_ARRAY luck
#  3. INTEGER_ARRAY important
#
def luckBalance(k, luck, important):
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
    k = _next_int()
    luck = [0] * n
    important = [0] * n
    for _i in range(n):
        luck[_i] = _next_int()
        important[_i] = _next_int()

    _out.append(str(luckBalance(k, luck, important)))

    sys.stdout.write("\n".join(_out) + "\n")


main()
