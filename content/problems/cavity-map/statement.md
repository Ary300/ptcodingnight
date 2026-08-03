# Cavity Map

After a week of October rain, Panther Robotics flew their survey drone over the old
orchard slope on the west edge of campus, the same 68 acres that once grew the Lilly
family's apples, and produced a depth map of the ground: a square grid of digits, one
digit per survey cell, where a larger digit means the ground sits lower. Mr. Ritz wants
the map annotated before the drainage report goes out. A cell is worth flagging only if
water genuinely pools there, that is, if the cell is strictly lower than the ground on
all four sides of it. Kylie pointed out that cells on the edge of the surveyed square
have open ground beyond them, so they can never pool, and that two side-by-side cells
can never both be flagged, since neither can be strictly lower than the other.

You are given an $n \times n$ grid of digits. A cell is a cavity if it is not on the
border of the grid and its digit is strictly greater than the digits of all four of its
orthogonal neighbours (up, down, left, right). Print the grid with the digit of every
cavity replaced by the uppercase letter `X`; every other cell is printed unchanged.

## Input

The first line contains one integer $n$, the side length of the grid.
Each of the next $n$ lines contains a string of exactly $n$ digits. The $j$-th character
of the $i$-th line is the depth $d_{i,j}$ of the cell in row $i$, column $j$.

## Output

Print $n$ lines of $n$ characters: the same grid, with the digit of every cavity
replaced by `X` and all other characters unchanged.

## Constraints

- $1 \le n \le 500$
- $1 \le d_{i,j} \le 9$

## Example

**Example 1**

Input:
```
4
1129
1592
1863
1224
```
Output:
```
1129
15X2
1X63
1224
```

Two cells qualify. The $9$ in row $2$, column $3$ has neighbours $2$ (above), $5$
(left), $2$ (right), and $6$ (below), and $9$ is strictly greater than all four, so it
becomes `X`. The $8$ in row $3$, column $2$ has neighbours $5$, $1$, $6$, and $2$, so it
becomes `X` as well. The $9$ in row $1$, column $4$ is on the border, so it is never a
cavity no matter what surrounds it.

**Example 2**

Input:
```
4
2222
2662
2662
2222
```
Output:
```
2222
2662
2662
2222
```

Every interior cell here is a $6$, and each of those four cells has another $6$ as a
neighbour. A cavity must be strictly greater than all four neighbours, and $6$ is not
strictly greater than $6$, so nothing is flagged and the grid is printed unchanged.
