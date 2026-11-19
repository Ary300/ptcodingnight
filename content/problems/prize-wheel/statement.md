# Prize Wheel

Aryav Das built a prize wheel for Coding Night. The wheel has $n$ slots arranged in a circle,
numbered $1$ to $n$ in clockwise order, and slot $i$ holds a prize of type $a_i$. A fixed arrow
points at one slot.

Aryav starts with the arrow on slot $j$ and writes that slot's prize type on his clipboard. Then
he may turn the wheel any number of times. Each turn moves the wheel exactly one slot, in either
direction, and after every turn he writes down the prize type now under the arrow. (Turning
toward slot $j+1$ after slot $n$ wraps around to slot $1$, and the other way round.)

Aryav wants every prize type that appears anywhere on the wheel to be on his clipboard. What is
the smallest number of turns he needs?

He has not decided which slot to start on, so answer the question separately for every starting
slot $j = 1, 2, \dots, n$. Each answer starts again from the original wheel.

## Input

The first line contains $n$.
The second line contains $n$ integers $a_1, a_2, \dots, a_n$.

## Output

Print $n$ integers separated by spaces. The $j$-th is the smallest number of turns when the
arrow starts on slot $j$.

## Constraints

- $1 \le n \le 200\,000$
- $1 \le a_i \le n$

## Example

**Example 1**

Input:
```
6
1 2 3 1 3 4
```
Output:
```
4 3 3 4 3 3
```

The prize types are $\{1, 2, 3, 4\}$. Starting on slot $1$ (type $1$), Aryav can turn once so
slot $6$ (type $4$) is under the arrow, then turn back three times to pass slots $1$, $2$ and
$3$, collecting types $1$, $2$ and $3$. That is $4$ turns, and no shorter sequence collects all
four types.

**Example 2**

Input:
```
7
5 5 2 5 5 5 7
```
Output:
```
4 4 3 4 5 4 3
```
