# Sherlock and Squares

The Park Tudor robotics team is repainting the practice field, and the seniors have decided
every drill zone must be a perfect square of turf: $1 \times 1$, $2 \times 2$, $3 \times 3$,
and so on. Facilities will only hand over a zone whose area, in square feet, is a whole
number of feet on each side. Given the range of areas still unclaimed in the storage log,
the build captain wants to know how many *square-shaped* zones fit inside that range.

For each range $[a, b]$, count the integers $n$ with $a \le n \le b$ such that $n$ is a
perfect square (that is, $n = k \times k$ for some positive integer $k$).

## Input

The first line contains one integer $q$, the number of ranges in the log.
Each of the next $q$ lines contains two space-separated integers $a$ and $b$, the first and
last area in that range, inclusive.

## Output

Print $q$ lines. Line $i$ contains a single integer: the number of perfect squares in the
$i$-th range.

## Constraints

- $1 \le q \le 100$
- $1 \le a \le b \le 10^9$

## Example

**Input**

```
2
3 9
17 24
```

**Output**

```
2
0
```

The first range covers $3, 4, \ldots, 9$; exactly two of those areas are perfect squares,
namely $4 = 2^2$ and $9 = 3^2$. The second range sits strictly between $16 = 4^2$ and
$25 = 5^2$, so it contains no perfect square at all and the answer is $0$.

A second sample is provided: the single range `1 1000000` answers `1000`, because the
perfect squares from $1^2$ up to $1000^2$ all land inside it.
