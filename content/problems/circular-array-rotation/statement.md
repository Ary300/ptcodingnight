# Circular Array Rotation

The Panthers robotics team bolted an LED ring around the top of their competition bot, and
Mr. Okafor wired it to spin. The ring has $n$ slots numbered $0$ through $n-1$ going
clockwise. Each tick of the animation, every light steps forward one slot: whatever is
sitting in slot $i$ moves to slot $(i+1) \bmod n$, and the light in the last slot wraps
around to slot $0$. The team wants to freeze the animation after exactly $k$ ticks and read
off a few slots for the pit display, but nobody wants to simulate a billion ticks by hand.

## Input

The first line contains three integers $n$, $k$, and $q$ — the number of slots, the number
of ticks the animation runs, and the number of slots to read.

The second line contains $n$ integers $a_0, a_1, \dots, a_{n-1}$, the brightness value
starting in each slot, in slot order.

Each of the next $q$ lines contains one integer $j$: a slot number to read after all $k$
ticks have happened.

## Output

Print $q$ lines. Line $t$ is the brightness value sitting in the queried slot $j_t$ after
the ring has ticked $k$ times.

## Constraints

- $1 \le n \le 10^5$
- $0 \le k \le 10^9$
- $1 \le q \le 10^5$
- $0 \le a_i \le 10^9$
- $0 \le j < n$ for every query

## Example

Input:

```
5 2 3
4 8 15 16 23
0
2
4
```

Output:

```
16
4
15
```

After two ticks the ring reads `16 23 4 8 15`, because each value moved forward two slots
and the last two wrapped to the front. So slot $0$ holds $16$, slot $2$ holds $4$, and slot
$4$ holds $15$.

A second sample uses $n = 4$, $k = 4$: four ticks on a four-slot ring is a full lap, so the
ring is exactly where it started and the answers are just the original values.
