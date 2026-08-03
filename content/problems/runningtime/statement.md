# Running Time of Algorithms

The algorithms unit at Park Tudor ends the same way every year: Mr. Ritz hands out an
unsorted list in the Ruth Lilly Science Center and asks not whether insertion sort will
sort it (everyone knows it will) but how much work it does along the way. Kylie and
Navraj traced the same list by hand last week and turned in two different totals, so
before Coding Night Mr. Ritz wants a program that settles it exactly: measure the cost
of a run of insertion sort, so the class can put a nearly sorted list next to a reversed
one and watch the running time change.

Insertion sort processes an array $a_1, a_2, \dots, a_n$ from left to right. For each
position $i$ from $2$ to $n$ it takes the value $v = a_i$ and walks left from position
$i - 1$: every element that is strictly greater than $v$ is moved one position to the
right, and the walk stops at the first element that is not strictly greater than $v$, or
at the front of the array. Then $v$ is placed into the gap. Moving one element one
position to the right counts as one shift; note that an element equal to $v$ is never
shifted. Given the array, print the total number of shifts insertion sort performs while
sorting it. This total is also the number of pairs $(i, j)$ with $i < j$ and $a_i > a_j$.

## Input

The first line contains one integer $n$, the length of the array.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print a single integer: the total number of shifts insertion sort performs on the array.

## Constraints

- $1 \le n \le 1000$
- $1 \le a_i \le 10^6$

## Example

**Example 1**

Input:
```
5
2 4 6 8 3
```
Output:
```
3
```

Inserting $4$, $6$, and $8$ costs nothing: each has no strictly greater element to its
left, so each stays put. Inserting $3$, the walk moves $8$, $6$, and $4$ one place right
(three shifts) and stops at $2$, giving $[2, 3, 4, 6, 8]$. The total is $3$.

**Example 2**

Input:
```
4
5 1 5 1
```
Output:
```
3
```

Inserting the first $1$ shifts $5$ right once: $[1, 5, 5, 1]$. Inserting the second $5$
costs nothing, because the $5$ to its left is equal, not strictly greater. Inserting the
last $1$ shifts both $5$s right (two shifts) and stops at the equal $1$:
$[1, 1, 5, 5]$. The total is $1 + 0 + 2 = 3$.
