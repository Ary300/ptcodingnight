# Two Tables, One Total

The Computer Science Club runs a bake sale outside the dining hall with two tables. At the end
of the day each table reports how many dollars it earned. A table that spent more on supplies
than it took in reports a negative number.

Given the two amounts, print the club's total for the day.

## Input

One line containing two integers $a$ and $b$, separated by a single space: the earnings of the
first table and of the second table, in dollars.

## Output

Print one integer, the sum $a + b$.

## Constraints

- $-1000000 \le a \le 1000000$
- $-1000000 \le b \le 1000000$

## Example

**Example 1**

Input:
```
35 48
```
Output:
```
83
```

The first table earned $35$ dollars and the second earned $48$, so the club earned
$35 + 48 = 83$ dollars.

**Example 2**

Input:
```
120 -15
```
Output:
```
105
```

The second table spent $15$ dollars more than it took in, so the total is
$120 + (-15) = 105$ dollars.
