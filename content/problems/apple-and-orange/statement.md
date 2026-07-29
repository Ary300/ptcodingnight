# Apple and Orange

Between rounds at Coding Night, the Panthers robotics crew drags two spring launchers into the gym: one loaded with apple slices, one loaded with orange wedges. The custodian, who has seen this before, unrolls a long tarp down the middle of the floor and says the club can keep launching as long as the fruit lands on the tarp. Every launch is logged as a signed offset from the launcher that fired it — positive means it flew to the right, negative means it flew to the left. Your job is to count the fruit that actually hit the tarp.

The gym floor is a number line. The tarp covers every point from $s$ to $t$, inclusive. The apple launcher sits at point $a$, the orange launcher sits at point $b$. An apple logged with offset $d$ lands at $a + d$; an orange logged with offset $e$ lands at $b + e$. A piece of fruit counts as on the tarp if its landing point is at least $s$ and at most $t$.

## Input

- Line 1: two integers $s$ and $t$, the ends of the tarp.
- Line 2: two integers $a$ and $b$, the launcher positions.
- Line 3: two integers $n$ and $m$, the number of apples and the number of oranges.
- Line 4: $n$ integers, the apple offsets.
- Line 5: $m$ integers, the orange offsets.

## Output

Two lines. Line 1 is the number of apples that landed on the tarp. Line 2 is the number of oranges that landed on the tarp.

## Constraints

- $1 \le s \le t \le 10^7$
- $1 \le a \le 10^7$ and $1 \le b \le 10^7$
- $1 \le n \le 10^5$ and $1 \le m \le 10^5$
- every offset is an integer in $[-10^7, 10^7]$

## Example

Input:

```
7 11
5 15
3 2
2 3 -1
-6 1
```

Output:

```
2
1
```

The apples land at $7$, $8$, and $4$; the first two are inside $[7, 11]$ and the third falls short, so the answer is $2$. The oranges land at $9$ and $16$, and only $9$ is on the tarp.

A second sample, `9 9 / 4 20 / 2 1 / 5 6 / -11`, answers `1` then `1`: the tarp is a single point, the apple at $4 + 5 = 9$ hits it, the apple at $10$ misses, and the orange at $20 - 11 = 9$ hits it.
