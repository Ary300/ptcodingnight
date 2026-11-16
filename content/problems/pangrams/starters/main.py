import sys

#
# Complete the 'pangrams' function below.
#
# The function is expected to return a STRING.
# The function accepts following parameter(s):
#  1. STRING s
#
def pangrams(s):
    # Write your code here
    return ""


# ---------------------------------------------------------------------------
# Everything below reads the input and prints the answer.
# You do not need to change anything below this line.
# ---------------------------------------------------------------------------
def main():
    # The sentence contains spaces, so it is read as one whole line.
    s = sys.stdin.readline().rstrip("\r\n")

    sys.stdout.write(str(pangrams(s)) + "\n")


main()
