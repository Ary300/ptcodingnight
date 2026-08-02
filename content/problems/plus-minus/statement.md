# Plus Minus

Between sets B and C of Coding Night, Mr. Ritz reconciles the adjustment log: every
bonus, penalty, and no-change entry recorded against the teams since the metal puzzle
opened. Bonuses go in as positive numbers, penalties as negative numbers, and an entry
of zero means a judge looked at a dispute and let the score stand. For the recap slide
in Ayres Auditorium he does not want the raw log, he wants proportions: what share of
the entries were bonuses, what share were penalties, and what share changed nothing.

You are given an array of $n$ integers. Compute the fraction of elements that are
positive, the fraction that are negative, and the fraction that are zero, and print the
three fractions as decimals with exactly $6$ digits after the decimal point, one per
line. Answers within $10^{-4}$ of the true value are accepted.

## Input

The first line contains one integer $n$, the number of entries in the log.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print three lines, each holding one decimal number with exactly $6$ digits after the
decimal point:

1. the fraction of the $n$ entries that are positive,
2. the fraction of the $n$ entries that are negative,
3. the fraction of the $n$ entries that are zero.

## Constraints

- $1 \le n \le 10^5$
- $-10^9 \le a_i \le 10^9$

## Example

**Example 1**

Input:
```
5
7 -3 0 2 -8
```
Output:
```
0.400000
0.400000
0.200000
```

Of the $5$ entries, two are positive ($7$ and $2$), two are negative ($-3$ and $-8$),
and one is zero. So the fractions are $2/5 = 0.400000$, $2/5 = 0.400000$, and
$1/5 = 0.200000$.

**Example 2**

Input:
```
3
0 12 4
```
Output:
```
0.666667
0.000000
0.333333
```

Two of the $3$ entries are positive ($12$ and $4$), none are negative, and one is zero.
The fractions are $2/3 = 0.666667$ (rounded to $6$ decimal places), $0/3 = 0.000000$,
and $1/3 = 0.333333$. A category with no entries still gets its line.
