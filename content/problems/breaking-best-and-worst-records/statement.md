# Breaking the Records

The Tribune runs a season recap for every one of Park Tudor's sixteen varsity teams, and
this winter Kylie has the Panthers basketball beat. After each game at the Irsay Family
Sports Center she adds the team's point total to a running log, and the recap template
Mr. Ritz handed the sports desk asks for exactly two numbers: how many times during the
season the team set a new season-high score, and how many times it set a new season-low.
The first game of the season starts both records, and a game that only ties a record does
not count as breaking it.

You are given the point totals of $n$ games in the order they were played. The first
total becomes both the initial highest record and the initial lowest record, and setting
it breaks neither. Each later total breaks the highest record if it is strictly greater
than every total before it, and breaks the lowest record if it is strictly less than
every total before it. Count how many totals break the highest record and how many break
the lowest record.

## Input

The first line contains one integer $n$, the number of games in the season.
The second line contains $n$ space-separated integers $p_1, p_2, \dots, p_n$, where
$p_i$ is the team's point total in the $i$-th game.

## Output

Print two space-separated integers on one line: the number of times the highest record
was broken, then the number of times the lowest record was broken.

## Constraints

- $1 \le n \le 5000$
- $0 \le p_i \le 10^9$

## Example

**Example 1**

Input:
```
5
12 24 10 24 4
```
Output:
```
1 2
```

Game $1$ sets both records at $12$. Game $2$ scores $24 > 12$, breaking the highest
record once. Game $3$ scores $10 < 12$, breaking the lowest record. Game $4$ scores $24$
again, which only ties the highest record, so nothing is broken. Game $5$ scores
$4 < 10$, breaking the lowest record a second time. The highest record was broken $1$
time and the lowest record $2$ times.

**Example 2**

Input:
```
6
7 7 9 2 15 8
```
Output:
```
2 1
```

Game $1$ sets both records at $7$. Game $2$ ties both records exactly, so neither is
broken. Game $3$ scores $9 > 7$, breaking the highest record. Game $4$ scores $2 < 7$,
breaking the lowest record. Game $5$ scores $15 > 9$, breaking the highest record again.
Game $6$ scores $8$, which is between $2$ and $15$, so nothing changes. That is $2$
breaks of the highest record and $1$ break of the lowest.
