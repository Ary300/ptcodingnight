# Library Fine

The upper school library in Foster Hall runs on a fine schedule that has not changed since
the merger with Park School, and the circulation desk enforces it without sentiment. Mr.
Ritz supervises the student aides who work the desk, and this week that is Kylie, who
stamps each returned book with the return date and looks up the due date in the ledger.
The schedule is deliberately blunt: it does not count calendar days across months, it just
looks at which part of the date slipped. Kylie would rather the computer do the arithmetic
so she can get back to laying out the next issue of the Tribune.

Given the date a book was actually returned and the date it was due, compute the fine in
cents according to this table, applying exactly one row, the first that matches from top
to bottom:

| Condition | Fine (cents) |
|---|---|
| Returned on or before the due date (comparing year, then month, then day) | $0$ |
| Returned in a later year than the due year | $10000$, flat |
| Same year, returned in a later month | $500 \times (\text{months late})$ |
| Same year and month, returned on a later day | $15 \times (\text{days late})$ |

Note that only the coarsest late unit is charged. A book due December 31 and returned
January 1 of the next year costs the flat $10000$, not one day's fine.

## Input

The first line contains three space-separated integers $d_r$, $m_r$, $y_r$: the day, month,
and year the book was returned.
The second line contains three space-separated integers $d_e$, $m_e$, $y_e$: the day,
month, and year the book was due.

## Output

Print a single integer: the fine in cents.

## Constraints

- $1 \le d_r, d_e \le 31$
- $1 \le m_r, m_e \le 12$
- $1 \le y_r, y_e \le 3000$

## Example

**Example 1**

Input:
```
9 6 2025
6 6 2025
```
Output:
```
45
```

The return date and due date share year $2025$ and month $6$, and the book came back
$9 - 6 = 3$ days late. The fine is $15 \times 3 = 45$ cents.

**Example 2**

Input:
```
15 5 2025
2 7 2025
```
Output:
```
0
```

The return day $15$ is later than the due day $2$, but that never matters on its own:
comparing year, then month, May comes before July, so the book is early and the fine is
$0$.

**Example 3**

Input:
```
1 1 2026
31 12 2025
```
Output:
```
10000
```

The book came back only one calendar day late, but the return year $2026$ is later than
the due year $2025$, so the flat charge of $10000$ cents applies.
