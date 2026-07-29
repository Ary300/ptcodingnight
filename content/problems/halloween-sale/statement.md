# Halloween Sale

The Panther Spirit Store runs the same gimmick every Halloween: a table of glow-in-the-dark
pumpkin keychains with a price tag that melts as you shop. The first keychain you carry to
the register costs $p$ cents. Every keychain after that costs $d$ cents less than the one
before it, but the cashier will never ring one up below $m$ cents — once the price hits the
floor it stays there all night. You have $b$ cents in your hoodie pocket, you must buy the
keychains one at a time in this order, and you stop the moment you cannot afford the next
one. How much loot do you leave with?

## Input

The first line contains one integer $q$, the number of shoppers to simulate.
Each of the next $q$ lines contains four space-separated integers $p$, $d$, $m$ and $b$:
the price of the first keychain, the amount the price drops after each purchase, the lowest
price the cashier will ever charge, and the money that shopper has.

## Output

Print $q$ lines. For each shopper, print two space-separated integers: the number of
keychains that shopper buys, and the total number of cents spent.

## Constraints

- $1 \le q \le 20$
- $1 \le p \le 100000$
- $1 \le d \le 100000$
- $1 \le m \le p$
- $0 \le b \le 10^9$

## Example

Input:
```
2
20 3 6 85
5 10 1 4
```
Output:
```
7 82
0 0
```

The first shopper sees prices $20, 17, 14, 11, 8$, and then $6$ forever, because $5$ is
below the floor of $m = 6$. Buying the first five costs $70$ cents and leaves $15$, which
covers exactly two more keychains at $6$ cents each with $3$ cents left over: $7$ keychains
for $82$ cents. The second shopper cannot even afford the first keychain, so they buy
nothing and spend nothing.

A second sample, `10 2 10 100`, has $p = m$, so the price never moves off $10$ and the
shopper buys $10$ keychains for exactly $100$ cents.
