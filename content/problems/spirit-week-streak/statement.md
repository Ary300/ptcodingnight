# Spirit Week Streak

Student Council runs spirit days all year, and on each one somebody stands by the Upper
School entrance with a clicker counting how many Panthers showed up in the day's color.
Council sets a participation goal, and a spirit day counts as a hit if at least that many
students took part. A streak is a run of consecutive spirit days that were all hits, and
the council wants to brag about the best one at the next assembly.

The best streak is the longest one. If two streaks have the same length, the one with more
total participants is better. If they tie on that as well, the one that happened first is
the one they talk about, although it makes no difference to what you print.

## Input

The first line contains two integers $n$ and $g$: the number of spirit days in the log and
the participation goal.

The second line contains $n$ integers $c_1, c_2, \dots, c_n$, where $c_i$ is the number of
students counted on the $i$-th spirit day.

## Output

Print two integers separated by a space: the number of days in the best streak and the total
number of students counted across those days. If no spirit day met the goal, print `0 0`.

## Constraints

- $1 \le n \le 1000$
- $1 \le g \le 5000$
- $0 \le c_i \le 5000$

## Example

Sample 1 input:

```
10 30
12 35 40 28 31 33 30 29 50 60
```

Sample 1 output:

```
3 94
```

With a goal of 30, the hits are days 2, 3, 5, 6, 7, 9 and 10. That gives three streaks:
days 2 to 3 (two days, 75 students), days 5 to 7 (three days, 94 students), and days 9 to
10 (two days, 110 students). The three-day streak is the longest, so the answer is `3 94`.
Day 7 counts as a hit because 30 is at least the goal.

Sample 2 input:

```
8 20
20 25 10 30 15 19 40 41
```

Sample 2 output:

```
2 81
```

The streaks are days 1 to 2 (45 students), day 4 alone (30 students), and days 7 to 8 (81
students). Two streaks are two days long, so the tie goes to the one with more students.
