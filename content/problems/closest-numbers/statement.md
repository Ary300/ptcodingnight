# Closest Numbers

The weather station on the roof of the Ruth Lilly Science Center logs one integer
temperature reading per session, and after a full year the log is a long, unordered mess
of numbers, some of them well below zero from the January mornings. Navraj is building a
graphic for The Tribune about how tightly the campus readings cluster, and Mr. Ritz has
asked him to start with the obvious question: which readings sit closest together on the
number line? Not just one such pair, either. If several pairs are tied for closest, the
graphic labels every one of them.

You are given $n$ distinct integers. Find the minimum absolute difference between any two
of them, then output every pair of values whose absolute difference equals that minimum.
Print each pair as its smaller value followed by its larger value, and print the pairs in
increasing order of their smaller value, all on a single line.

## Input

The first line contains one integer $n$, the number of readings.
The second line contains $n$ space-separated distinct integers $a_1, a_2, \dots, a_n$.

## Output

Print one line of space-separated integers: every pair of values from the input whose
absolute difference is the minimum over all pairs. Each pair appears as the smaller value
immediately followed by the larger value, and the pairs are ordered by increasing smaller
value. A value that belongs to two tied pairs appears once in each of its pairs.

## Constraints

- $2 \le n \le 3000$
- $-10^7 \le a_i \le 10^7$
- All $a_i$ are distinct.

## Example

**Example 1**

Input:
```
7
6 -3 12 9 -8 0 4
```
Output:
```
4 6
```

Sorted, the readings are $-8, -3, 0, 4, 6, 9, 12$. The gaps between neighbors are
$5, 3, 4, 2, 3, 3$, so the minimum absolute difference is $2$, achieved only by the pair
$(4, 6)$. No other pair of readings is that close, so the answer is the single pair
`4 6`.

**Example 2**

Input:
```
6
30 5 15 40 20 35
```
Output:
```
15 20 30 35 35 40
```

Sorted, the readings are $5, 15, 20, 30, 35, 40$ with neighbor gaps $10, 5, 10, 5, 5$.
The minimum absolute difference is $5$, and three pairs achieve it: $(15, 20)$,
$(30, 35)$, and $(35, 40)$. Listed by increasing smaller value, that is
`15 20 30 35 35 40`. Note that $35$ appears twice: once as the larger value of
$(30, 35)$ and once as the smaller value of $(35, 40)$.
