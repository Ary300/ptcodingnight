# Grid Challenge

Between sets at Coding Night, the side table in Foster Hall carries the metal puzzle, the
train tracks, and a stack of laminated letter grids that Mr. Ritz prints fresh every year.
The grid game has one legal move: pick a row and rearrange its letters however you like.
Kylie and Dominic worked out quickly that the only rearrangement worth making is sorting
the row, and that a grid counts as "solved" when, after every row is sorted, reading down
any column never steps backward in the alphabet. Mr. Ritz grades a whole stack at once, so
he wants a program that takes several grids and calls each one solvable or not.

You are given $t$ independent square grids of lowercase English letters. For each grid,
sort the letters of every row into non-decreasing (alphabetical) order. Then decide
whether every column of the resulting grid is also in non-decreasing order when read from
top to bottom. Report the answer for each grid separately.

## Input

The first line contains one integer $t$, the number of grids.

Each grid is then given as follows: a line containing one integer $n$, the side length of
the grid, followed by $n$ lines, each containing a string of exactly $n$ lowercase English
letters.

## Output

For each grid, in the order given, print `YES` on its own line if every column is in
non-decreasing order after all rows are sorted, and `NO` otherwise.

## Constraints

- $1 \le t \le 20$
- $1 \le n \le 300$
- Every grid line consists of exactly $n$ lowercase English letters (`a` to `z`).

## Example

**Example 1**

Input:
```
1
3
cab
bca
acb
```
Output:
```
YES
```

Sorting each row gives `abc`, `abc`, `abc`. Column $1$ reads `a`, `a`, `a` from top to
bottom, column $2$ reads `b`, `b`, `b`, and column $3$ reads `c`, `c`, `c`. Every column
is non-decreasing, so the answer is `YES`.

**Example 2**

Input:
```
2
2
zy
xw
4
dbca
gefh
ikjl
prqo
```
Output:
```
NO
YES
```

In the first grid, sorting the rows gives `yz` and `wx`. Column $1$ reads `y` then `w`,
and `w` comes before `y` in the alphabet, so that column steps backward: the answer is
`NO`. In the second grid, sorting the rows gives `abcd`, `efgh`, `ijkl`, `opqr`. The
columns read `aeio`, `bfjp`, `cgkq`, `dhlr`, all non-decreasing, so the answer is `YES`.
