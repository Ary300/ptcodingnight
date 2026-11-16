import sys

#
# Complete the 'maxActiveBookings' function below.
#
# The function is expected to return an INTEGER.
# The function accepts following parameter(s):
#  1. INTEGER_ARRAY starts
#  2. INTEGER_ARRAY ends
#
def maxActiveBookings(starts, ends):
    # Write your code here
    return 0


#
# Complete the 'coveredMinutes' function below.
#
# The function is expected to return a LONG_INTEGER.
# The function accepts following parameter(s):
#  1. INTEGER_ARRAY starts
#  2. INTEGER_ARRAY ends
#
def coveredMinutes(starts, ends):
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
    starts = [0] * n
    ends = [0] * n
    for _i in range(n):
        starts[_i] = _next_int()
        ends[_i] = _next_int()

    _out.append(str(maxActiveBookings(starts, ends)))
    _out.append(str(coveredMinutes(starts, ends)))

    sys.stdout.write("\n".join(_out) + "\n")


main()
