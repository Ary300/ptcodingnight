# Find the Median

The cider store on the old Lilly orchard side of campus keeps a paper ledger, and Kylie
volunteered to type it up. Each entry is one day's net change in bottled cider stock: a
positive number on delivery days, a negative one when a home game empties the shelves.
Mr. Ritz wants a single number that describes a typical day, and he does not trust the
average, because one homecoming weekend drags it around. He asks for the median instead,
and he has been careful to hand Kylie an odd number of days so the middle is never in
dispute.

You are given an odd-length list of integers. Sort the list in nondecreasing order and
print the element that lands in the middle, that is, the element at position
$(n+1)/2$ (1-indexed) of the sorted list. Duplicates are counted separately: each value
occupies its own position in the sorted order.

## Input

The first line contains a single odd integer $n$, the number of entries.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print a single integer: the median of the list.

## Constraints

- $1 \le n \le 10^5$, and $n$ is odd
- $-10^6 \le a_i \le 10^6$

## Example

**Example 1**

Input:
```
5
12 -3 7 7 30
```
Output:
```
7
```

Sorted, the list reads $-3, 7, 7, 12, 30$. With $n = 5$ the middle position is
$(5+1)/2 = 3$, and the third element is $7$. Note that the two copies of $7$ each take
their own slot; the duplicate does not merge away.

**Example 2**

Input:
```
1
-14
```
Output:
```
-14
```

A single-entry list is its own middle: with $n = 1$ the median is the only element,
$-14$.
