# Beautiful Pairs

Between sets B and C at Coding Night, Mr. Ritz supervises the puzzle table in Foster
Hall: metal puzzles, train tracks, and a stack of Connections grids. Every puzzle he set
out is stamped with a difficulty code, listed on his checkout sheet, and Navraj logs the
code of each puzzle that comes back. A returned entry can be checked off against a
checkout entry only when the two codes match, and no entry may be checked off twice.
Navraj thinks one code on the return log might be wrong, though not which one, so before
the count Mr. Ritz may correct one entry of the return log, replacing it with a code of his
choosing. He does not have to correct anything, and he wants whatever choice lets him check
off as many entries as possible.

You are given two arrays $a$ and $b$, each containing $n$ integers. A pair of indices
$(i, j)$ is *beautiful* if $a_i = b_j$. A collection of beautiful pairs is *disjoint* if
no index of $a$ and no index of $b$ appears in more than one pair of the collection. You
may change at most one element of $b$: either leave $b$ exactly as it is, or choose one
position $j$ and replace $b_j$ with any integer between $1$ and $100$. Print the largest
possible size of a disjoint collection of beautiful pairs.

## Input

The first line contains one integer $n$, the length of both arrays.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.
The third line contains $n$ space-separated integers $b_1, b_2, \dots, b_n$.

## Output

Print a single integer: the maximum number of disjoint beautiful pairs obtainable after
changing at most one element of $b$ to a value between $1$ and $100$.

## Constraints

- $1 \le n \le 1000$
- $1 \le a_i \le 100$ and $1 \le b_i \le 100$

## Example

**Example 1**

Input:
```
4
1 2 3 4
1 2 3 3
```
Output:
```
4
```

Without any change, the pairs $(1, 1)$, $(2, 2)$, and $(3, 3)$ can be checked off, using
the values $1$, $2$, and $3$; nothing in $b$ matches $a_4 = 4$. Changing $b_4$ from $3$
to $4$ adds the pair $(4, 4)$, so all $4$ indices pair off.

**Example 2**

Input:
```
4
2 2 5 7
5 7 2 2
```
Output:
```
4
```

Here $b$ is already a perfect rearrangement of $a$: the pairs $(1, 3)$, $(2, 4)$,
$(3, 1)$, and $(4, 2)$ give $4$ disjoint beautiful pairs. Changing any element of $b$
would only break one of those pairs, so Mr. Ritz leaves the log alone and the answer
is $4$.
