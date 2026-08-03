# Flatland Space Stations

For Coding Night, Mr. Ritz lines the long Foster Hall corridor with a single straight row
of tables, one team workstation per table, numbered from $0$ at the Ayres Auditorium end to
$n-1$ at the door to the Ruth Lilly Science Center. The building has a fixed number of
usable outlets, so power strips only reach some of the tables. When a laptop battery dies
mid-set, the team carries it down the row to the nearest table with a power strip, and
Mr. Ritz wants to know, before teams arrive, how bad that walk can possibly get.

The tables sit at the integer points $0, 1, \dots, n-1$ of a line, so the distance between
tables $i$ and $j$ is $|i - j|$. Exactly $m$ table numbers are listed as having a power
strip; the same table number may appear in the list more than once. For each table, its
walking distance is the distance to the closest table that has a power strip (zero if it
has one itself). Compute the maximum walking distance over all $n$ tables.

## Input

The first line contains two space-separated integers $n$ and $m$, the number of tables and
the length of the power strip list.
The second line contains $m$ space-separated integers $c_1, c_2, \dots, c_m$, the table
numbers that have a power strip. The list is in no particular order and may contain
repeats.

## Output

Print a single integer: the largest distance from any table to its nearest table with a
power strip.

## Constraints

- $1 \le n \le 10^5$
- $1 \le m \le n$
- $0 \le c_i \le n - 1$

## Example

**Example 1**

Input:
```
5 2
0 4
```
Output:
```
2
```

Tables $0$ and $4$ have power strips. Tables $0$ and $4$ walk distance $0$, tables $1$ and
$3$ walk distance $1$, and table $2$ is distance $2$ from both strips. The worst walk is
$2$.

**Example 2**

Input:
```
6 1
1
```
Output:
```
4
```

The only power strip is at table $1$. Table $0$ walks $1$, but the distances grow toward
the far end: tables $2, 3, 4, 5$ walk $1, 2, 3, 4$. Table $5$ has no strip on its far
side, so its only option is the strip at table $1$, giving the answer $4$.
