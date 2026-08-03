# Luck Balance

Zain, who anchors one of the Coding Night teams, holds a superstition he refuses to
explain: luck is conserved. Every competition he loses banks luck for later, and every
competition he wins spends exactly that much. He has the season's full schedule in front
of him, from Science Bowl qualifiers in the Ruth Lilly Science Center to Friday
scrimmages in Foster Hall, and he has already assigned each event a luck value. Some
events are rated: Mr. Ritz records those results toward the club standings, and he will
tolerate Zain losing at most $k$ rated events before pulling him from the lineup. The
unrated events nobody records, so Zain can throw every one of them without consequence,
and he intends to walk into Coding Night with the largest luck balance the schedule
allows.

You are given $n$ contests. Contest $i$ has a luck value $L_i$ and an importance flag
$T_i$: the contest is important if $T_i = 1$ and unimportant if $T_i = 0$. Losing a
contest adds $L_i$ to the luck balance; winning it subtracts $L_i$. The outcome of every
contest may be chosen freely, except that at most $k$ important contests may be lost.
Starting from a balance of zero, compute the maximum total luck balance achievable.

## Input

The first line contains two space-separated integers $n$ and $k$, the number of contests
and the maximum number of important contests that may be lost.
Each of the next $n$ lines contains two space-separated integers $L_i$ and $T_i$, the
luck value and importance flag of the $i$-th contest.

## Output

Print a single integer: the maximum luck balance achievable. Note that the answer can be
negative.

## Constraints

- $1 \le n \le 10^5$
- $0 \le k \le n$
- $1 \le L_i \le 10^4$
- $T_i \in \{0, 1\}$

## Example

**Example 1**

Input:
```
6 2
5 1
1 1
4 0
6 1
2 0
3 1
```
Output:
```
13
```

The important contests carry luck $5$, $1$, $6$, and $3$; the unimportant ones carry $4$
and $2$. Both unimportant contests are lost for free, adding $4 + 2 = 6$. At most $k = 2$
important contests may be lost, so the two largest ($6$ and $5$) are lost, adding $11$,
and the remaining two ($3$ and $1$) are won, subtracting $4$. The balance is
$6 + 11 - 4 = 13$, and no other choice of outcomes does better.

**Example 2**

Input:
```
4 0
8 1
2 0
5 1
7 0
```
Output:
```
-4
```

Here $k = 0$, so every important contest must be won: winning the contests with luck $8$
and $5$ subtracts $13$. Losing both unimportant contests adds $2 + 7 = 9$. The best
achievable balance is $9 - 13 = -4$.
