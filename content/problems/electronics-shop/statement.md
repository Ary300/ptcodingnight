# Electronics Shop

Panther Robotics keeps a spare-parts shelf in the Ruth Lilly Science Center, and the week
before Coding Night it is looking thin: the build room keyboard has three dead keys and
the team needs a USB drive to carry set solutions between machines. Mr. Ritz hands Kylie
the club card with a firm spending cap and one instruction, buy exactly one keyboard and
exactly one drive, and since leftover money goes back to the activities office, she would
rather spend as much of the cap as the price list allows.

You are given a budget $b$, the prices of $n$ keyboards, and the prices of $m$ USB
drives. Choose exactly one keyboard and exactly one USB drive so that their combined
price is as large as possible without exceeding $b$. Report that combined price, or $-1$
if every possible pair costs more than $b$.

## Input

The first line contains three integers $b$, $n$, and $m$: the budget, the number of
keyboards, and the number of USB drives.
The second line contains $n$ space-separated integers $k_1, k_2, \dots, k_n$, the
keyboard prices.
The third line contains $m$ space-separated integers $d_1, d_2, \dots, d_m$, the USB
drive prices.

## Output

Print a single integer: the largest total $k_i + d_j$ that does not exceed $b$, or $-1$
if no keyboard and drive pair fits within the budget.

## Constraints

- $1 \le n \le 1000$
- $1 \le m \le 1000$
- $1 \le b \le 10^9$
- $1 \le k_i \le 10^6$ for every keyboard
- $1 \le d_j \le 10^6$ for every drive

## Example

**Example 1**

Input:
```
10 2 3
3 1
5 2 8
```
Output:
```
9
```

The six possible pairs cost $3+5=8$, $3+2=5$, $3+8=11$, $1+5=6$, $1+2=3$, and $1+8=9$.
The pair costing $11$ blows the budget of $10$, so the best affordable total is
$1+8=9$. Note that the cheaper keyboard wins here: pairing the pricier keyboard greedily
would cap out at $8$.

**Example 2**

Input:
```
5 2 2
4 6
2 3
```
Output:
```
-1
```

Every pair costs at least $4+2=6$, which already exceeds the budget of $5$, so no
purchase is possible and the answer is $-1$.
