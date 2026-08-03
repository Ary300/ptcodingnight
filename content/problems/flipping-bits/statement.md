# Flipping bits

Panther Robotics stores its drivetrain controller in a crate in the Irsay Family Sports
Center between competitions, and the first bench test of the season came back as pure
nonsense: every status register read as the exact opposite of what the simulator
predicted. Kylie traced the fault to a logic probe clipped onto the inverted output of
the register latch, so all 32 bits of every reading arrive flipped. Rewiring the harness
before Mr. Ritz's safety inspection is not going to happen, so Derek proposes the
software fix: take each raw reading and flip every bit back.

You are given $q$ unsigned 32-bit integers. For each one, flip all 32 of its bits (every
0 becomes 1 and every 1 becomes 0) and print the resulting unsigned 32-bit integer.
Equivalently, for a value $n$, print $2^{32} - 1 - n$.

## Input

The first line contains one integer $q$, the number of readings.
Each of the next $q$ lines contains a single integer $n_i$, one raw reading.

## Output

Print $q$ lines. The $i$-th line must contain the value of $n_i$ with all 32 bits
flipped, as an unsigned decimal integer.

## Constraints

- $1 \le q \le 10^5$
- $0 \le n_i < 2^{32}$

## Example

**Example 1**

Input:
```
3
0
4
9
```
Output:
```
4294967295
4294967291
4294967286
```

Written out in 32 bits, $9$ is `00000000000000000000000000001001`. Flipping every bit
gives `11111111111111111111111111110110`, which is $4294967286$. Likewise $0$ (all 32
bits clear) becomes all 32 bits set, which is $2^{32} - 1 = 4294967295$, and $4$ becomes
$4294967291$.

**Example 2**

Input:
```
2
4294967295
2147483647
```
Output:
```
0
2147483648
```

$4294967295$ is all 32 bits set, so flipping it clears every bit and yields $0$.
$2147483647$ is a single clear bit followed by thirty-one set bits
(`01111111111111111111111111111111`); flipping gives
`10000000000000000000000000000000`, which is $2^{31} = 2147483648$.
