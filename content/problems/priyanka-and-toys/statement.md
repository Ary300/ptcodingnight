# Priyanka and Toys

The morning after Coding Night, the prize toys that nobody claimed between rounds of the
metal puzzle and Connections are still stacked on a table in Foster Hall, and Mr. Ritz
wants the room back before Monday classes. He puts Kylie in charge of shipping the whole
pile to a downtown toy drive. The supplier the school orders from sells padded crates by
base weight: a crate ordered at base weight $w$ safely holds any number of toys weighing
from $w$ to $w + 4$ ounces. Crates are not cheap, so Kylie weighs every toy on the scale
borrowed from the Ruth Lilly Science Center and wants to order as few crates as she can.

You are given the weights of $n$ toys. A crate is ordered by choosing an integer base
weight $w \ge 0$; that crate accepts any toy whose weight $v$ satisfies
$w \le v \le w + 4$, and one crate holds any number of such toys. Every toy must be
placed in some crate. Print the minimum number of crates that must be ordered.

## Input

The first line contains one integer $n$, the number of toys.
The second line contains $n$ space-separated integers $w_1, w_2, \dots, w_n$, where
$w_i$ is the weight of the $i$-th toy in ounces.

## Output

Print a single integer: the minimum number of crates needed to pack every toy.

## Constraints

- $1 \le n \le 10^5$
- $0 \le w_i \le 10^4$

## Example

**Example 1**

Input:
```
5
3 5 8 15 16
```
Output:
```
3
```

A crate at base weight $3$ holds anything from $3$ to $7$ ounces, so the toys weighing
$3$ and $5$ go in together. The toy weighing $8$ needs a second crate (base weight $8$
covers $8$ to $12$). A third crate at base weight $15$ covers $15$ to $19$ and takes the
last two toys. No pair of crates can cover all five weights, so the answer is $3$.

**Example 2**

Input:
```
5
10 14 14 10 19
```
Output:
```
2
```

A crate at base weight $10$ covers $10$ to $14$ ounces, which takes both toys weighing
$10$ and both weighing $14$ (a weight of exactly $w + 4$ still fits). Only the toy
weighing $19$ is left, and one more crate handles it, for a total of $2$.
