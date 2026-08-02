# Gena Playing Hanoi

The puzzle table at Coding Night normally offers the metal puzzle, the train tracks, and
Connections, but this year Mr. Ritz added a Tower of Hanoi set with four rods instead of
the usual three. Between sets B and C, Navraj left a game half-finished to go argue about
Connections, and by the time he got back the discs were spread across all four rods. To
be fair, whoever moved them kept every position legal, no disc was ever placed on a
smaller one. Navraj wants the whole tower rebuilt on the first rod before set C opens,
and he wants to know how few moves that takes.

You are given a legal position of a Tower of Hanoi game played with $4$ rods, numbered
$1$ through $4$, and $n$ discs of distinct sizes, numbered $1$ (smallest) through $n$
(largest). On each rod the discs form a stack with smaller discs above larger ones, so
the position is fully described by naming the rod each disc is on. A move takes the
topmost disc of one rod and places it on top of another rod; this is allowed only if
that rod is empty or its current topmost disc is larger than the disc being moved.
Compute the minimum number of moves needed to reach the position where all $n$ discs
are stacked on rod $1$.

## Input

The first line contains one integer $n$, the number of discs.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$, where
$a_i$ is the rod currently holding disc $i$.

## Output

Print a single integer: the minimum number of moves needed to move all $n$ discs onto
rod $1$.

## Constraints

- $1 \le n \le 10$
- $1 \le a_i \le 4$

## Example

**Example 1**

Input:
```
3
3 3 1
```
Output:
```
3
```

Discs $1$ and $2$ sit on rod $3$ with disc $1$ on top, and disc $3$ is already on rod
$1$. Two moves cannot finish: disc $2$ cannot move while disc $1$ is on top of it, and
if disc $1$ moves straight to rod $1$, disc $2$ can never land on it. Three moves do:
disc $1$ to rod $2$, disc $2$ to rod $1$, disc $1$ to rod $1$.

**Example 2**

Input:
```
3
2 2 2
```
Output:
```
5
```

All three discs start stacked on rod $2$. With a fourth rod available, both small discs
get their own parking spot: disc $1$ to rod $3$, disc $2$ to rod $4$, disc $3$ to rod
$1$, disc $2$ to rod $1$, disc $1$ to rod $1$. Five moves, two fewer than the classic
three-rod answer of $7$.
