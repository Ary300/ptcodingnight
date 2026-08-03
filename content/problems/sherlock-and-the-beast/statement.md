# Sherlock and The Beast

During the lull between sets B and C at Coding Night, the side tables in the Ruth Lilly
Science Center fill up fast: the metal puzzle, the train tracks, Connections, and a
shoebox of adhesive digit tiles that Mr. Ritz keeps for relabeling lockers in Foster
Hall. Years of relabeling have picked the box clean of everything except two kinds of
tiles, 5s and 3s, in effectively unlimited supply. Zain and Kylie turn the leftovers into
a game: name a length, then spell out the biggest number you can at that length, under
house rules strict enough that some lengths cannot be played at all.

Call a positive integer a Panther number if its decimal representation contains only the
digits 5 and 3, the number of 5s in it is divisible by 3, and the number of 3s in it is
divisible by 5. A count of zero is divisible by anything, so a Panther number may use
only one of the two digits. For each queried length $n$, determine the largest Panther
number that has exactly $n$ digits, or report that none exists.

## Input

The first line contains one integer $t$, the number of queries.
Each of the next $t$ lines contains one integer $n$, a queried length.

## Output

For each query, print one line containing the largest Panther number with exactly $n$
digits. If no Panther number of that length exists, print $-1$ instead.

## Constraints

- $1 \le t \le 20$
- $1 \le n \le 10^5$

## Example

**Example 1**

Input:
```
2
5
3
```
Output:
```
33333
555
```

For $n = 5$, using five 5s fails because $5$ is not divisible by $3$, and mixing is
impossible at this length, but zero 5s (divisible by $3$) and five 3s (divisible by $5$)
is legal, giving $33333$. For $n = 3$, three 5s and zero 3s satisfies both rules, and
$555$ beats every string containing a $3$, so the answer is $555$.

**Example 2**

Input:
```
3
1
8
11
```
Output:
```
-1
55533333
55555533333
```

For $n = 1$, a lone 5 gives one 5 ($1$ is not divisible by $3$) and a lone 3 gives one 3
($1$ is not divisible by $5$), so no Panther number of length $1$ exists and the answer
is $-1$. For $n = 8$, the only legal split is three 5s and five 3s; placing every 5
before every 3 maximizes the value, giving $55533333$. For $n = 11$, the only legal
split is six 5s and five 3s, giving $55555533333$.
