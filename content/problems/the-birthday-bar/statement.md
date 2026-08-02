# Subarray Division

Kylie's birthday landed on Coding Night this year, and between sets B and C, Gavin came
back from the cider store on campus with one of the novelty chocolate bars they keep by
the register: a long bar scored into squares, each square stamped with a single digit.
The table tradition is strict about how the birthday piece is broken off. It has to be one
unbroken run of consecutive squares, it must contain exactly as many squares as the month
she was born in, and the stamped digits on it must add up to the day of the month she was
born on. Mr. Ritz, supervising the room, wants to know how many ways the piece could be
broken off before anyone actually snaps the bar.

You are given the sequence of stamped numbers on the bar, a target sum $d$, and a required
length $m$. Count the contiguous runs of exactly $m$ consecutive squares whose stamped
numbers sum to exactly $d$. Runs starting at different positions are counted separately,
even if they contain the same numbers.

## Input

The first line contains one integer $n$, the number of squares in the bar.
The second line contains $n$ space-separated integers $s_1, s_2, \dots, s_n$, where $s_i$
is the number stamped on the $i$-th square.
The third line contains two space-separated integers $d$ and $m$: the target sum and the
required run length.

## Output

Print a single integer: the number of contiguous runs of exactly $m$ squares whose
stamped numbers sum to $d$.

## Constraints

- $1 \le n \le 100000$
- $1 \le s_i \le 9$
- $1 \le d \le 31$
- $1 \le m \le \min(12, n)$

## Example

**Example 1**

Input:
```
5
1 4 3 2 5
5 2
```
Output:
```
2
```

The runs of length $2$ are $(1, 4)$, $(4, 3)$, $(3, 2)$, and $(2, 5)$, with sums $5$, $7$,
$5$, and $7$. Two of them, $(1, 4)$ and $(3, 2)$, sum to $d = 5$, so the answer is $2$.

**Example 2**

Input:
```
6
4 5 4 2 4 5
4 1
```
Output:
```
3
```

With $m = 1$ every single square is its own run, so we just count squares stamped with
$d = 4$. Squares $1$, $3$, and $5$ qualify, giving $3$.
