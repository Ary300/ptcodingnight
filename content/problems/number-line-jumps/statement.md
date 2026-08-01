# Number Line Jumps

The Panther robotics team has taped a numbered strip down the length of the science hallway
and parked two hopping rovers on it. Every time the timer beeps, both rovers hop forward by
their own fixed jump length, always toward larger numbers, never backward. The team wants
to know whether the two rovers ever share a mark on the same beep, because that is exactly
the moment their bumpers clack together and somebody has to go pick up a servo horn.

## Input

The first line contains one integer $q$, the number of rover pairs to check.

Each of the next $q$ lines contains four space-separated integers
$s_1$, $j_1$, $s_2$, $j_2$: the starting mark and jump length of the first rover, then the
starting mark and jump length of the second rover. Beep $0$ is the moment before any hop,
when the rovers are still on their starting marks.

## Output

Print $q$ lines, one per pair, in the order the pairs were given.

For each pair, print the smallest beep number $k \ge 0$ at which both rovers stand on the
same mark. If no such beep exists, print `NEVER`.

## Constraints

- $1 \le q \le 20000$
- $0 \le s_1, s_2 \le 10^9$
- $0 \le j_1, j_2 \le 10^6$
- A jump length of $0$ means that rover never moves.

## Example

Input:

```
3
2 5 17 2
4 3 9 3
7 0 7 6
```

Output:

```
5
NEVER
0
```

The first rover pair closes a gap of $15$ marks at $3$ marks per beep, so after $5$ beeps
both sit on mark $27$. The second pair jumps at the same speed, so their $5$-mark gap never
shrinks. The third pair already shares mark $7$ before anything moves, so the answer is
beep $0$.

A second sample uses one pair near the ends of the strip:

```
1
0 1000000 1000000000 0
```

Output:

```
1000
```

The stationary rover waits on mark $10^9$ while the other covers $10^6$ marks per beep.
