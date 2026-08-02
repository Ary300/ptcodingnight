# Diagonal Difference

Panther Robotics bolted a square grid of load sensors under the practice ramp in the
Irsay Family Sports Center, one sensor per grid cell, to check whether the ramp sits
level before drive practice. After each run every sensor reports one signed reading:
positive if that cell is pressed harder than its calibrated zero, negative if lighter.
Mr. Ritz signs off on the ramp only after seeing one number per run, the team's standard
tilt check: add up the readings along each of the two diagonals of the grid and report
how far apart those two totals are. Navraj got tired of doing it on a whiteboard, so the
job is now yours.

Given a square matrix of integers, compute the sum of the entries on its primary
diagonal (top-left to bottom-right) and the sum of the entries on its secondary diagonal
(top-right to bottom-left), and print the absolute value of the difference between the
two sums. If the matrix has odd side length, the center entry lies on both diagonals and
is included in both sums.

## Input

The first line contains a single integer $n$, the side length of the matrix.

Each of the next $n$ lines contains $n$ space-separated integers; the $j$-th integer on
the $i$-th of these lines is $a_{i,j}$, the entry in row $i$, column $j$.

## Output

Print a single integer on its own line:

$$\left| \sum_{i=1}^{n} a_{i,i} \; - \; \sum_{i=1}^{n} a_{i,\,n+1-i} \right|$$

that is, the absolute difference between the primary diagonal sum and the secondary
diagonal sum.

## Constraints

- $1 \le n \le 1000$
- $-10^4 \le a_{i,j} \le 10^4$ for every entry

## Example

**Example 1**

Input:
```
3
6 1 3
2 5 7
9 8 4
```
Output:
```
2
```

The primary diagonal is $6, 5, 4$, which sums to $15$. The secondary diagonal is
$3, 5, 9$, which sums to $17$. The center entry $5$ belongs to both. The answer is
$|15 - 17| = 2$.

**Example 2**

Input:
```
2
-4 3
7 10
```
Output:
```
4
```

The primary diagonal is $-4, 10$, summing to $6$. The secondary diagonal is $3, 7$,
summing to $10$. The answer is $|6 - 10| = 4$. Readings can be negative, and the raw
difference can be negative too, so take the absolute value before printing.
