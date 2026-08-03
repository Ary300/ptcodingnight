# Largest Permutation

Coding Night opens with a photo for The Tribune: every team placard, numbered $1$ through
$n$, clipped in a single row along the rail at the front of Ayres Auditorium. The placards
went up in whatever order the teams checked in, and Mr. Ritz wants the row to read as
impressively as possible from the left, because the left end is all that survives the
paper's crop. Unclipping two placards and trading their spots takes a full trip up and
down the ladder, and Kylie, who is on ladder duty, has time for at most $k$ such trades
before the doors open.

You are given a permutation $a_1, a_2, \dots, a_n$ of the integers $1$ through $n$ and an
integer $k$. In one swap you may choose any two positions and exchange the values held at
those positions. Perform at most $k$ swaps (possibly fewer, possibly none) so that the
resulting sequence is lexicographically largest, and print that sequence. A sequence $x$
is lexicographically larger than a sequence $y$ of the same length if, at the first
position where they differ, $x$ holds the larger value.

## Input

The first line contains two space-separated integers $n$ and $k$.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$, a
permutation of the integers $1$ through $n$.

## Output

Print a single line with $n$ space-separated integers: the lexicographically largest
sequence that can be reached from $a$ using at most $k$ swaps.

## Constraints

- $1 \le n \le 10^5$
- $0 \le k \le 10^9$
- $a$ is a permutation of $1, 2, \dots, n$

## Example

**Example 1**

Input:
```
5 1
4 2 3 5 1
```
Output:
```
5 2 3 4 1
```

Only one swap is available, so it has to buy the biggest possible improvement at the
leftmost position. The value $5$ sits at position $4$; swapping positions $1$ and $4$
turns $4\ 2\ 3\ 5\ 1$ into $5\ 2\ 3\ 4\ 1$. Every other single swap leaves something
smaller than $5$ in front, and any sequence starting with $5\ 2\ 3\ 4$ cannot be beaten
here, so this is the answer.

**Example 2**

Input:
```
3 1
2 1 3
```
Output:
```
3 1 2
```

The three possible single swaps give $1\ 2\ 3$, then $3\ 1\ 2$, then $2\ 3\ 1$. The one
that brings $3$ to the front wins: $3\ 1\ 2$ beats $2\ 3\ 1$ at the first position and
$1\ 2\ 3$ even more so.

**Example 3**

Input:
```
4 2
1 2 3 4
```
Output:
```
4 3 2 1
```

The first swap brings $4$ to position $1$, giving $4\ 2\ 3\ 1$. The second brings $3$ to
position $2$, giving $4\ 3\ 2\ 1$, which is the largest arrangement of these values
outright, so the budget of $k = 2$ is exactly enough.
