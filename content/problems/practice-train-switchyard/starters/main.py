import sys

#
# Complete the 'canDepartInOrder' function below.
#
# The function is expected to return a BOOLEAN: True when the cars can depart
# in the order 1, 2, ..., n.
# The function accepts following parameter(s):
#  1. INTEGER_ARRAY cars
#
def canDepartInOrder(cars):
    # Write your code here
    return False


#
# Complete the 'smallestDepartureOrder' function below.
#
# The function is expected to return an INTEGER_ARRAY.
# The function accepts following parameter(s):
#  1. INTEGER_ARRAY cars
#
def smallestDepartureOrder(cars):
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
    cars = [_next_int() for _ in range(n)]

    _out.append("ON TIME" if canDepartInOrder(cars) else "DELAYED")
    _out.append(" ".join(str(_e) for _e in smallestDepartureOrder(cars)))

    sys.stdout.write("\n".join(_out) + "\n")


main()
