# Bill Division

The cider store on campus still sells out of the old orchard stock every October, and
during the break between sets B and C of Coding Night, Kylie and Sameer walked over and
loaded a tray: doughnuts, a jug of cider, caramel corn, the usual. The deal was to split
the bill straight down the middle, except that one item on the receipt was a mulled cider
Sameer never touched, so that one is Kylie's alone. Kylie added it up, told Sameer what he
owed, and collected. Sameer, reading the receipt on the walk back to Foster Hall, wants to
check her arithmetic.

You are given the $n$ prices on the receipt, the position $k$ of the one item that only
one person consumed, and the amount $b$ that the other person was actually charged. The
fair charge is half of the sum of all prices excluding $p_k$; that sum is guaranteed to be
even, and $b$ is guaranteed to be at least the fair charge. Decide whether the charge was
fair, and if it was not, report the size of the overcharge.

## Input

The first line contains two integers $n$ and $k$: the number of items on the receipt and
the 1-based position of the item that was not shared.
The second line contains $n$ space-separated integers $p_1, p_2, \dots, p_n$, where $p_i$
is the price of the $i$-th item.
The third line contains a single integer $b$, the amount actually charged.

## Output

If $b$ equals the fair charge, print the single word `Fair`. Otherwise print a single
integer: the difference between $b$ and the fair charge, that is, the amount of the
overcharge.

## Constraints

- $2 \le n \le 10^5$
- $1 \le k \le n$
- $0 \le p_i \le 10^4$
- The sum of all prices excluding $p_k$ is even.
- $f \le b \le 10^9$, where $f$ is the fair charge.

## Example

**Example 1**

Input:
```
4 2
3 10 2 9
12
```
Output:
```
5
```

The item at position $2$ (price $10$) was not shared, so the shared portion of the bill is
$3 + 2 + 9 = 14$ and the fair charge is $14 / 2 = 7$. The actual charge was $12$, which is
$12 - 7 = 5$ too much, so the answer is $5$.

**Example 2**

Input:
```
3 1
2 4 6
5
```
Output:
```
Fair
```

The item at position $1$ (price $2$) is excluded, leaving $4 + 6 = 10$ to split. The fair
charge is $10 / 2 = 5$, which is exactly what was collected, so the split was `Fair`.
