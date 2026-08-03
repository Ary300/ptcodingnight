# Beautiful Pairs

Between sets B and C at Coding Night, Mr. Ritz supervises the puzzle table in Foster
Hall: metal puzzles, train tracks, and a stack of Connections grids. Every puzzle he set
out is stamped with a difficulty code, listed on his checkout sheet, and Navraj logs the
code of each puzzle that comes back. A returned entry can be checked off against a
checkout entry only when the two codes match, and no entry may be checked off twice.
Navraj is certain that exactly one code on the return log is wrong, though not which one,
so before the count Mr. Ritz will correct exactly one entry of the return log, replacing
it with a different code of his choosing, and he wants the correction that lets him check
off as many entries as possible.

You are given two arrays $a$ and $b$, each containing $n$ integers. A pair of indices
$(i, j)$ is *beautiful* if $a_i = b_j$. A collection of beautiful pairs is *disjoint* if
no index of $a$ and no index of $b$ appears in more than one pair of the collection. You
must change exactly one element of $b$: choose a position $j$ and replace $b_j$ with an
integer between $1$ and $100$ that is different from the current $b_j$. This change is
mandatory, even if $a$ and $b$ already match perfectly. Print the largest possible size
of a disjoint collection of beautiful pairs after the change.

## Input

The first line contains one integer $n$, the length of both arrays.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.
The third line contains $n$ space-separated integers $b_1, b_2, \dots, b_n$.

## Output

Print a single integer: the maximum number of disjoint beautiful pairs obtainable after
changing exactly one element of $b$ to a different value between $1$ and $100$.

## Constraints

- $1 \le n \le 10^5$
- $1 \le a_i \le 100$ and $1 \le b_i \le 100$
- The replacement value is an integer between $1$ and $100$ and must differ from the
  value it replaces.

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
3
```

Here $b$ is already a perfect rearrangement of $a$: the pairs $(1, 3)$, $(2, 4)$,
$(3, 1)$, and $(4, 2)$ give $4$ disjoint beautiful pairs. But the change is mandatory,
and replacing any element of $b$ with a different value breaks exactly one of those
pairs without creating a new one, so the best Mr. Ritz can do is $3$.
