# The submission all 40 concurrent competitors send in the G8 burst.
#
# Deliberately correct and deliberately trivial. G8 measures the QUEUE and the judge under
# load — enqueue, wait, container creation, run, reconciliation — so the program itself must
# contribute as close to nothing as possible. A slow solution here would fold algorithm time
# into the p95 and make the number mean something else.
#
# Solves the seeded problem (fixtures/e2e/contest.json, "Panther Sum"): read two integers,
# print their sum.
import sys

a, b = map(int, sys.stdin.read().split())
print(a + b)
