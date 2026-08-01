# Solve Me First

The scoreboard laptop in the Park Tudor commons boots up about four minutes before Coding
Night starts, so the club officers use one tiny warm-up problem to prove the judge is
awake. Tonight's warm-up: the Panthers' robotics team hauled in two bins of practice
game pieces, one from the shop and one from the gym closet, and the drive coach wants a
single number on the whiteboard before the first match. Add the two counts. That's the
whole job: get a green verdict, then go get pizza.

## Input

Two lines.

- Line 1 contains a single integer $a$, the number of game pieces in the shop bin.
- Line 2 contains a single integer $b$, the number of game pieces in the gym closet bin.

A count may be negative: the coach records a bin that is short on pieces as a negative
number, because pieces still owed to another team count against the total.

## Output

Print one line containing a single integer: $a + b$.

## Constraints

- $-10^{9} \le a \le 10^{9}$
- $-10^{9} \le b \le 10^{9}$

Both values are plain base-10 integers with no leading `+`, no spaces inside the number,
and no thousands separators.

## Example

Input:

```
17
25
```

Output:

```
42
```

The shop bin holds 17 pieces and the gym closet holds 25, so the coach writes
$17 + 25 = 42$ on the whiteboard. Note that a negative input is allowed too: an input of
`-6` and `4` would print `-2`, because the six pieces owed cancel out four of the pieces
on hand.
