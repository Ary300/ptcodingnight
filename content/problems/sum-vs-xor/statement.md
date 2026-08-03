# Sum vs XOR

Between sets B and C at Coding Night, while the metal puzzle makes its slow lap around
the tables, Mr. Ritz puts a one-line claim on the projector: for certain values of $x$,
adding $x$ to a number and XOR-ing $x$ into it produce the exact same result, because the
addition never carries. Kylie checks a few cases on paper and believes it. Zain wants to
know precisely how many such $x$ there are for a given number, and Mr. Ritz, sensing an
easy way to keep two students busy until set C, assigns exactly that.

Given a non-negative integer $n$, count the integers $x$ satisfying $0 \le x \le n$ and
$n + x = n \oplus x$, where $\oplus$ denotes bitwise exclusive or (XOR).

## Input

A single line containing one integer $n$.

## Output

Print a single integer on its own line: the number of values $x$ with $0 \le x \le n$
such that $n + x = n \oplus x$.

## Constraints

- $0 \le n \le 10^{18}$
- The answer always fits in a signed 64-bit integer, but for large $n$ it does **not**
  fit in a 32-bit one.

## Example

**Example 1**

Input:
```
10
```
Output:
```
4
```

$10$ is $1010$ in binary. The four values that work are $x = 0, 1, 4, 5$:
$10 + 0 = 10 = 10 \oplus 0$, and $10 + 1 = 11 = 10 \oplus 1$, and
$10 + 4 = 14 = 10 \oplus 4$, and $10 + 5 = 15 = 10 \oplus 5$.
Any $x$ that shares a set bit with $10$ fails; for instance $x = 2$ gives
$10 + 2 = 12$ but $10 \oplus 2 = 8$, because the addition carries.

**Example 2**

Input:
```
0
```
Output:
```
1
```

The only candidate is $x = 0$, and $0 + 0 = 0 = 0 \oplus 0$, so the count is $1$.

**Example 3**

Input:
```
7
```
Output:
```
1
```

$7$ is $111$ in binary, so every $x$ with $1 \le x \le 7$ shares at least one set bit
with $7$ and forces a carry: for example $7 + 1 = 8$ while $7 \oplus 1 = 6$. Only
$x = 0$ works.
