# Divisible Sum Pairs

The Park Tudor robotics team has a bin of spare gears, and every gear has a tooth count stamped on it. To build a clean two-gear stage, Coach Reyes insists that the *combined* tooth count of the two gears be an exact multiple of $k$, the number of spokes on the drive hub. Before anyone starts bolting things together at 7pm, the team wants to know how many workable gear pairs are even sitting in the bin.

Given the tooth counts, count the pairs of **distinct positions** $i < j$ whose tooth counts add up to a multiple of $k$. Two different gears may have the same tooth count stamped on them. They are still two different gears, and a pair using both of them counts.

## Input

The first line contains two integers $n$ and $k$, separated by a single space: the number of gears in the bin and the spoke count of the drive hub.

The second line contains $n$ integers $t_1, t_2, \dots, t_n$, separated by single spaces: the tooth counts, in bin order.

## Output

Print a single integer: the number of index pairs $(i, j)$ with $1 \le i < j \le n$ such that $t_i + t_j$ is divisible by $k$.

## Constraints

- $2 \le n \le 200{,}000$
- $1 \le k \le 100$
- $1 \le t_i \le 1{,}000{,}000{,}000$ for every $i$

The answer can exceed the range of a 32-bit integer, so Java solutions should use `long`.

## Example

**Input**

```
6 3
4 7 9 2 5 3
```

**Output**

```
5
```

The gears at positions 3 and 6 have tooth counts 9 and 3, and $9 + 3 = 12$ is a multiple of 3. That is one pair. The remaining four pairs each combine a gear with remainder 1 (positions 1 and 2) with a gear with remainder 2 (positions 4 and 5): $4+2$, $4+5$, $7+2$, and $7+5$ are all multiples of 3. That is $1 + 4 = 5$ pairs in total.
