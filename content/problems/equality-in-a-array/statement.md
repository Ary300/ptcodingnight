# Equalize the Array

The campus at 7200 N. College Avenue sits on what used to be the Lilly family apple
orchard, and the cider store that still operates there grades every incoming apple with an
integer quality grade. A crate ships only if every apple in it carries the same grade, so
before a crate is sealed, Kylie walks the line and pulls apples off it. Mr. Ritz, who
supervises the store shift, wants the pull count kept as low as possible: pulling an apple
is fine, but swapping its grade sticker is not allowed.

You are given an array of $n$ integers. In one operation you may delete any single
element. Determine the minimum number of deletions required so that all remaining
elements of the array are equal to each other. Deleting every element but one (or the
array having only one element to begin with) counts as making all remaining elements
equal.

## Input

The first line contains one integer $n$, the number of elements in the array.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print a single integer: the minimum number of deletions needed so that every element left
in the array has the same value.

## Constraints

- $1 \le n \le 10^5$
- $1 \le a_i \le 100$

## Example

**Example 1**

Input:
```
6
5 5 2 5 8 5
```
Output:
```
2
```

The value $5$ appears $4$ times, more often than any other value. Keep those four fives
and delete the $2$ and the $8$: two deletions. Keeping any other value would force at
least five deletions, so $2$ is the minimum.

**Example 2**

Input:
```
5
7 4 4 7 9
```
Output:
```
3
```

Both $7$ and $4$ appear twice, and no value appears more often. Whichever pair is kept,
the other three elements must go, so the answer is $3$.
