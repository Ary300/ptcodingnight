# Lonely Integer

Coding Night in Foster Hall winds down at the side tables: train tracks, Connections, and
the crate of metal puzzles that Mr. Ritz signs out two at a time, one for each half of a
team. Every puzzle carries a stamped serial number, and the two puzzles in a matched pair
carry the same number. When the last round ends, Kylie empties the return crate and scans
each serial as it comes out of the bin. Tonight the crate is one puzzle short: every
serial came up twice except one, and that lonely serial belongs to the puzzle still
sitting on a table somewhere in the building.

You are given a list of $n$ integers in which every value appears exactly twice, except
for exactly one value, which appears exactly once. Find and print that value.

## Input

The first line contains one integer $n$, the number of entries in the list. $n$ is odd.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print a single integer: the value that appears exactly once in the list.

## Constraints

- $1 \le n \le 10^5$, and $n$ is odd
- $0 \le a_i \le 10^9$
- Every value in the list appears exactly twice, except exactly one value, which appears
  exactly once.

## Example

**Example 1**

Input:
```
5
2 3 5 3 2
```
Output:
```
5
```

The value $2$ appears twice (positions $1$ and $5$), and $3$ appears twice (positions $2$
and $4$). Only $5$ appears once, so $5$ is the answer.

**Example 2**

Input:
```
9
10 14 10 8 21 8 14 33 21
```
Output:
```
33
```

Here $10$, $14$, $8$, and $21$ each appear exactly twice. The one value scanned a single
time is $33$, so that is the serial of the missing puzzle.
