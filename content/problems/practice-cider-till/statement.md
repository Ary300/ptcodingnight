# The Cider Store Till

The Park Tudor campus at 7200 N. College Avenue sits on what used to be the Lilly family
apple orchard, and the cider store that came with the orchard never closed. On a busy
autumn afternoon Kylie works the till, and every sale gets punched in as a whole number of
cents. When her shift ends she has to report two numbers to Mr. Ritz: how much the till
took in altogether, and the single biggest sale of the day.

You are given the till log for one shift: the number of sales $n$ followed by the $n$ sale
amounts, in the order they were rung up. Print the total of all the sales and the largest
single sale.

## Input

The first line contains one integer $n$, the number of sales in the shift.
The second line contains $n$ space-separated integers $p_1, p_2, \dots, p_n$, where $p_i$
is the amount of the $i$-th sale in cents.

## Output

Print two integers separated by a single space: first the sum $p_1 + p_2 + \dots + p_n$,
then the largest value among $p_1, p_2, \dots, p_n$. If the largest amount was rung up
more than once, print it once.

## Constraints

- $1 \le n \le 1000$
- $1 \le p_i \le 100000$

## Example

**Example 1**

Input:
```
4
350 275 610 480
```
Output:
```
1715 610
```

Four sales were rung up. Their total is $350 + 275 + 610 + 480 = 1715$ cents, and the
biggest single sale was the third one, $610$ cents.

**Example 2**

Input:
```
5
500 125 500 90 260
```
Output:
```
1475 500
```

The total is $500 + 125 + 500 + 90 + 260 = 1475$ cents. Two different sales tied for the
largest at $500$ cents; the largest value is still $500$, printed once.
