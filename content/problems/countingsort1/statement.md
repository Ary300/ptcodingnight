# Counting Sort 1

Park Tudor's 68 acres at 7200 N. College Avenue used to be the Lilly family apple
orchard, and the cider store on campus still presses every fall. The sorting line
scans each apple as it rolls past and stamps it with a grade from 0 to 99. At close,
Kylie reads the day's grades off the scanner log and fills in the tally sheet Mr. Ritz
posts by the register: one column per grade, how many apples landed in it, and a
column that caught nothing still gets written down as a zero.

You are given a list of $n$ integers, each between $0$ and $99$ inclusive. For every
value $v$ from $0$ to $99$, in increasing order, count how many times $v$ occurs in
the list. Print all $100$ counts on a single line, separated by single spaces. A value
that never occurs has count $0$ and must still be printed.

## Input

The first line contains one integer $n$, the number of values in the list.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print one line of exactly $100$ space-separated integers. The $(v+1)$-th integer on
the line is the number of times the value $v$ occurs in the list, for $v = 0, 1,
\dots, 99$.

## Constraints

- $1 \le n \le 10^5$
- $0 \le a_i \le 99$

## Example

**Example 1**

Input:
```
6
5 0 99 5 12 0
```
Output:
```
2 0 0 0 0 2 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1
```

The value $0$ occurs twice, so the first number printed is $2$. The value $5$ also
occurs twice, so the sixth number (position $v = 5$) is $2$. The values $12$ and $99$
each occur once, so position $12$ holds $1$ and the final position, $99$, holds $1$.
Every other value from $0$ to $99$ never appears, so the remaining $96$ positions are
all $0$.

**Example 2**

Input:
```
3
7 7 7
```
Output:
```
0 0 0 0 0 0 0 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
```

All three values are $7$, so position $v = 7$ holds $3$ and the other $99$ positions
hold $0$. Note that the line is still $100$ numbers long even though only one value
ever appears.
