# Maximum Perimeter Triangle

Panther Robotics keeps a bin of leftover aluminum rods at the back of the Ruth Lilly
Science Center, and nothing in that bin is ever thrown out. On Coding Night, while the
side tables argue over the metal puzzle, Mr. Ritz hands the bin to Kylie with a job:
build a triangular display frame for the trophy shelf outside the Irsay Family Sports
Center, using exactly three rods, uncut and unbent. The Pioneer Conference banner hangs
right above that shelf, so Kylie wants the largest frame the bin allows.

You are given the lengths of $n$ rods. Choose exactly three of them that form a triangle
with positive area, meaning every side is strictly shorter than the sum of the other two.
Among all such choices, take the one with the maximum perimeter. If several choices tie
on perimeter, take the one whose longest side is largest; if there is still a tie, take
the one whose second longest side is largest. Report the three chosen lengths, or report
that no valid choice exists.

## Input

The first line contains one integer $n$, the number of rods in the bin.
The second line contains $n$ space-separated integers $L_1, L_2, \dots, L_n$, where
$L_i$ is the length of the $i$-th rod.

## Output

Print one line. If at least one triple of rods forms a triangle with positive area,
print the three chosen side lengths in non-decreasing order, separated by single spaces.
Otherwise print `-1`.

## Constraints

- $3 \le n \le 100$
- $1 \le L_i \le 10^9$

## Example

**Example 1**

Input:
```
5
1 2 3 9 10
```
Output:
```
3 9 10
```

The rods $3$, $9$, and $10$ satisfy the triangle condition, since $3 + 9 = 12 > 10$,
$3 + 10 > 9$, and $9 + 10 > 3$. Their perimeter is $22$. The next best valid choice is
$2$, $9$, $10$ with perimeter $21$, and no other triple beats $22$ (for instance $1$,
$2$, $3$ is flat, because $1 + 2 = 3$ is not strictly greater than $3$).

**Example 2**

Input:
```
4
1 2 4 8
```
Output:
```
-1
```

Every triple fails the strict inequality: $1 + 2 = 3 \le 4$, $1 + 2 = 3 \le 8$,
$1 + 4 = 5 \le 8$, and $2 + 4 = 6 \le 8$. No triangle with positive area can be built,
so the answer is $-1$.

**Example 3**

Input:
```
6
5 2 5 6 1 5
```
Output:
```
5 5 6
```

The rods $5$, $5$, and $6$ give perimeter $16$, and $5 + 5 = 10 > 6$, so the triangle
has positive area. Using the three rods of length $5$ instead gives perimeter $15$,
which is smaller. Note the sides are printed in non-decreasing order even though the
rods appear in a different order in the input.
