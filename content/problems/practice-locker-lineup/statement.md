# Locker Lineup

The lockers along the main corridor of Foster Hall were installed in batches over the
years, so the numbers stamped on their plates no longer run in order down the hall.
Before Coding Night, Kylie walks the corridor with a clipboard for the student services
office, reading each plate in the order she passes it. To gauge how scrambled the
corridor has become, she wants a simple tally: at how many lockers does the plate number
go up compared with the locker she read just before it?

You are given the plate numbers in corridor order. Count the positions where a plate
number is strictly greater than the plate number immediately before it. The first locker
in the corridor has no locker before it and is never counted.

## Input

The first line contains one integer $n$, the number of lockers in the corridor.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$, where
$a_i$ is the number stamped on the $i$-th locker plate in walking order.

## Output

Print a single integer: the number of indices $i$ with $2 \le i \le n$ such that
$a_i > a_{i-1}$.

## Constraints

- $1 \le n \le 200000$
- $1 \le a_i \le 10^9$

## Example

**Example 1**

Input:
```
8
14 9 21 21 30 4 4 17
```
Output:
```
3
```

Walking the corridor, the number goes up three times: from $9$ to $21$, from $21$ to
$30$, and from $4$ to $17$. The step from $21$ to $21$ does not count because the
comparison is strict, and the drops from $14$ to $9$ and from $30$ to $4$ do not count
at all.

**Example 2**

Input:
```
5
2 3 3 5 1
```
Output:
```
2
```

The number rises from $2$ to $3$ and from $3$ to $5$, so the answer is $2$. The repeat
$3$ after $3$ is not a rise, and the final plate $1$ is lower than the $5$ before it.
