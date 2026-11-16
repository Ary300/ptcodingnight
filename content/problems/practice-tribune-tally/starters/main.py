import sys

#
# Complete the 'tribuneTally' function below.
#
# The function is expected to return a 2D_INTEGER_ARRAY with one row per query:
# [total ledger lines for that word, distinct issue numbers for that word].
# The function accepts following parameter(s):
#  1. INTEGER_ARRAY issues
#  2. STRING_ARRAY words
#  3. STRING_ARRAY queries
#
def tribuneTally(issues, words, queries):
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
    q = _next_int()
    issues = [0] * n
    words = [""] * n
    for _i in range(n):
        issues[_i] = _next_int()
        words[_i] = _next_token()
    queries = [_next_token() for _ in range(q)]

    for _row in tribuneTally(issues, words, queries):
        _out.append(" ".join(str(_e) for _e in _row))

    sys.stdout.write("\n".join(_out) + "\n")


main()
