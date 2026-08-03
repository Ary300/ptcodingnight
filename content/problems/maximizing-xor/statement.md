# Maximizing XOR

Every Coding Night ends the same way in the Ruth Lilly Science Center: the metal puzzle
comes out, the train tracks get packed up, and Mr. Ritz hands the projector one last
warm-down question before scores are read. This year his warm-down is about badge
numbers. Every participant wears a numbered badge, and the badges handed out tonight
form one unbroken run of consecutive integers. Mr. Ritz calls two badges a "far pair"
based on the bitwise XOR of their numbers, and he wants to know how far apart, by that
measure, two badges from tonight's run can possibly be.

Given two integers $l$ and $r$, consider every pair of integers $a$ and $b$ with
$l \le a \le b \le r$. Compute the maximum possible value of $a \oplus b$, where
$\oplus$ denotes bitwise XOR.

## Input

A single line containing two space-separated integers $l$ and $r$.

## Output

Print a single integer: the maximum value of $a \oplus b$ over all pairs with
$l \le a \le b \le r$.

## Constraints

- $1 \le l \le r \le 1000$

## Example

**Example 1**

Input:
```
10 15
```
Output:
```
7
```

The candidates run from $10$ to $15$. Taking $a = 10$ (binary $1010$) and $b = 13$
(binary $1101$) gives $1010 \oplus 1101 = 0111$, which is $7$. No pair in the range
does better: every number from $10$ to $15$ starts with the bits $1$ and then differs
only in its lowest three bits, so no XOR in this range can exceed $7$.

**Example 2**

Input:
```
11 100
```
Output:
```
127
```

Here $a = 63$ (binary $0111111$) and $b = 64$ (binary $1000000$) are both inside the
range, and $63 \oplus 64 = 1111111$ in binary, which is $127$. Since every number up to
$100$ fits in seven bits, $127$ is the largest value any XOR of two such numbers could
reach, so this pair is optimal.
