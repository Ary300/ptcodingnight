# Beautiful Triplets

The 68 acres at 7200 N. College Avenue were the Lilly family's apple orchard before they
were a campus, and one row of the original trees still stands on the slope between the
cider store and the Hilbert Early Education Center. For a Tribune piece on what survives
of the orchard, Kylie walked the row and measured each tree's distance from a marker post
at the head of it, recording the measurements in increasing order. Mr. Ritz, who had dug
up the original planting plan for her, pointed out that the orchard crews spaced their
trees a fixed distance apart: so any three trees in her list where both neighboring gaps
equal that historic spacing are almost certainly original plantings, and those are the
trios her article should count.

You are given a strictly increasing sequence of integers $a_1 < a_2 < \dots < a_n$ and an
integer $d$. Count the number of index triples $(i, j, k)$ with $i < j < k$ such that
$a_j - a_i = d$ and $a_k - a_j = d$.

## Input

The first line contains two space-separated integers $n$ and $d$, the length of the
sequence and the required gap.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$ in strictly
increasing order.

## Output

Print a single integer: the number of triples $(i, j, k)$ with $i < j < k$ such that
$a_j - a_i = a_k - a_j = d$.

## Constraints

- $1 \le n \le 2000$
- $1 \le d \le 10^9$
- $0 \le a_i \le 10^9$
- $a_1 < a_2 < \dots < a_n$

## Example

**Example 1**

Input:
```
7 3
1 2 4 5 7 8 10
```
Output:
```
3
```

Three trios have both gaps equal to $3$: the values $(1, 4, 7)$, $(2, 5, 8)$, and
$(4, 7, 10)$. For instance, $4 - 1 = 3$ and $7 - 4 = 3$, so $(1, 4, 7)$ counts. The
values $(5, 8, 11)$ would also qualify, but $11$ is not in the list.

**Example 2**

Input:
```
6 2
1 3 5 6 8 10
```
Output:
```
2
```

The qualifying trios are $(1, 3, 5)$ and $(6, 8, 10)$. The pair $3$ and $5$ also has gap
$2$, but $5 + 2 = 7$ is missing from the list, so no third tree completes that trio.
