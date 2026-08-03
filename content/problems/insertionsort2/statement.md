# Insertion Sort - Part 2

The cider store on campus still presses apples from trees left over from the Lilly family
orchard, and every October it takes a delivery of numbered crates that arrive in no
particular order. Mr. Ritz borrows the loading row for his algorithms section: Kylie and
Dominic walk the row left to right, and each time they slide a crate back into its proper
place among the already-ordered crates behind them, Gavin photographs the entire row. By
closing time the wall of the store carries one photo per pass, a frame-by-frame record of
insertion sort doing its work.

You are given an array of $n$ integers. Sort it with insertion sort: for each position
$i$ from the second element to the last, take the element at position $i$ and insert it
into its correct place among the first $i$ elements, shifting larger elements one step to
the right. After each of these $n - 1$ insertions, print the entire array on its own
line, even if that insertion moved nothing.

## Input

The first line contains one integer $n$, the size of the array.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print $n - 1$ lines. The $i$-th line is the full array, space separated, as it looks
immediately after the element originally at position $i + 1$ has been inserted into the
sorted prefix. If $n = 1$ there are no insertions to perform, so print nothing.

## Constraints

- $1 \le n \le 1000$
- $-10^6 \le a_i \le 10^6$

## Example

**Example 1**

Input:
```
5
6 3 4 1 5
```
Output:
```
3 6 4 1 5
3 4 6 1 5
1 3 4 6 5
1 3 4 5 6
```

The first insertion takes the $3$ and places it before the $6$, giving `3 6 4 1 5`. The
second takes the $4$ and slots it between $3$ and $6$. The third takes the $1$, shifts
$3$, $4$, and $6$ each one step right, and puts the $1$ at the front. The fourth takes
the $5$ and inserts it before the $6$, leaving the array fully sorted.

**Example 2**

Input:
```
4
2 -1 2 0
```
Output:
```
-1 2 2 0
-1 2 2 0
-1 0 2 2
```

The first insertion moves $-1$ ahead of $2$. The second element to insert is the second
$2$: it is already at least as large as everything before it, so nothing moves, but the
line `-1 2 2 0` is printed again anyway, because a line is printed after every insertion.
The third insertion places the $0$ between $-1$ and the two $2$s.
