# Minimum Absolute Difference in an Array

The cider store on the old orchard corner of campus keeps a plain paper ledger: one
integer per day, the net change in cases on the shelf, deliveries minus sales, so an entry
can be negative. Mr. Ritz's statistics class adopted the ledger as a data set this fall,
and Kylie's first assignment is a warm-up: find the two days whose entries landed closest
together, because a pair of near-identical days is where she wants to start looking for a
pattern. She does not need the days themselves yet, only how close the closest pair is.

You are given an array of $n$ integers. Compute the minimum absolute difference between
any two distinct elements of the array, that is, the minimum value of $|a_i - a_j|$ over
all pairs of indices $i < j$.

## Input

The first line contains one integer $n$, the number of entries.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print a single integer: the minimum value of $|a_i - a_j|$ over all pairs $i < j$.

## Constraints

- $2 \le n \le 2000$
- $-10^9 \le a_i \le 10^9$
- The entries are not necessarily distinct.

## Example

**Example 1**

Input:
```
5
3 -7 0 8 -3
```
Output:
```
3
```

Checking pairs: $|3 - 0| = 3$ and $|-3 - 0| = 3$ are the closest pairs in the array. Every
other pair is farther apart, for instance $|3 - (-3)| = 6$ and $|8 - 3| = 5$, so the
answer is $3$.

**Example 2**

Input:
```
4
-5 9 -5 2
```
Output:
```
0
```

The value $-5$ appears twice, at two different positions. Those two entries form a pair
with $|-5 - (-5)| = 0$, and no absolute difference can be smaller than $0$, so the answer
is $0$.
