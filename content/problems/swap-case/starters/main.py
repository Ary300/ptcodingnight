import sys

#
# Complete the 'swapCase' function below.
#
# The function is expected to return a STRING.
# The function accepts following parameter(s):
#  1. STRING s
#
def swapCase(s):
    # Write your code here
    return ""


# ---------------------------------------------------------------------------
# Everything below reads the input and prints the answer.
# You do not need to change anything below this line.
# ---------------------------------------------------------------------------
def main():
    # The line may contain spaces, so it is read whole rather than split.
    s = sys.stdin.readline().rstrip("\r\n")

    sys.stdout.write(str(swapCase(s)) + "\n")


main()
