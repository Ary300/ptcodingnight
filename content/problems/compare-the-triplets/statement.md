# Compare the Triplets

Between sets at Coding Night, Mr. Ritz runs the side tables: the metal puzzle, the train
tracks, and Connections. This year Kylie's team and Dominic's team finished dead even on
problems, so he is settling it at the side tables instead. He scores each team's showing at
each of the three tables on a scale of 1 to 100, then compares the two teams table by
table: whichever team scored strictly higher at a table earns one head-to-head point, and a
tied table earns nobody anything. The team totals decide who carries the trophy back to
Foster Hall.

Given two triples of ratings, one per contestant, compare them position by position. For
each of the three positions, the contestant with the strictly greater rating at that
position receives one point; if the two ratings are equal, neither receives a point.
Compute each contestant's total.

## Input

The first line contains three space-separated integers $a_1$, $a_2$, $a_3$, the ratings of
the first contestant.
The second line contains three space-separated integers $b_1$, $b_2$, $b_3$, the ratings of
the second contestant.

## Output

Print two space-separated integers on one line: the first contestant's total points,
then the second contestant's total points.

## Constraints

- $1 \le a_i \le 100$ for each $i$
- $1 \le b_i \le 100$ for each $i$

## Example

**Example 1**

Input:
```
64 80 27
64 12 91
```
Output:
```
1 1
```

Position 1 is a tie ($64 = 64$), so nobody scores. At position 2 the first contestant is
strictly higher ($80 > 12$) and earns a point. At position 3 the second contestant is
strictly higher ($91 > 27$) and earns a point. The totals are $1$ and $1$.

**Example 2**

Input:
```
88 99 100
12 99 3
```
Output:
```
2 0
```

The first contestant wins positions 1 and 3 ($88 > 12$ and $100 > 3$). Position 2 is a tie
($99 = 99$), so it awards nothing. The first contestant finishes with $2$ points, the
second with $0$.
