# Find Digits

Between sets B and C at Coding Night, while the graders catch up, Mr. Ritz runs a
two-minute filler round from the Ayres Auditorium projector: he puts an integer on the
screen and every team writes down how many of the number's own digits divide it evenly.
Zain argued that a zero digit ought to be worth something; Mr. Ritz ruled that zero
divides nothing and scores nothing, and the ruling stands. Kylie has been checking
answers by hand all night and would like a program to do it instead.

You are given $t$ integers. For each integer $n$, count how many digits in the decimal
representation of $n$ are divisors of $n$. Each occurrence of a digit counts separately:
if a digit appears three times and divides $n$, it contributes $3$ to the count. The
digit $0$ never counts, because division by zero is undefined.

## Input

The first line contains one integer $t$, the number of integers to process.
Each of the next $t$ lines contains one integer $n$.

## Output

For each of the $t$ integers, in order, print a single line containing one integer: the
number of digits of $n$ that divide $n$.

## Constraints

- $1 \le t \le 100$
- $1 \le n \le 10^9$

## Example

**Example 1**

Input:
```
2
24
305
```
Output:
```
2
1
```

For $n = 24$: the digit $2$ divides $24$ ($24 = 2 \cdot 12$) and the digit $4$ divides
$24$ ($24 = 4 \cdot 6$), so both digits count and the answer is $2$. For $n = 305$: the
digit $3$ does not divide $305$, the digit $0$ is skipped, and the digit $5$ divides
$305$ ($305 = 5 \cdot 61$), so the answer is $1$.

**Example 2**

Input:
```
3
7
1024
999999
```
Output:
```
1
3
6
```

$7$ has one digit, $7$, which divides itself, so the answer is $1$. For $n = 1024$: the
digit $1$ divides everything, the digit $0$ is skipped, the digit $2$ divides $1024$
($1024 = 2 \cdot 512$), and the digit $4$ divides $1024$ ($1024 = 4 \cdot 256$), giving
$3$. For $n = 999999$: all six digits are $9$, and $999999 = 9 \cdot 111111$, so every
occurrence counts and the answer is $6$.
