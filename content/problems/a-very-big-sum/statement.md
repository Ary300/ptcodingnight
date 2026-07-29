# A Very Big Sum

The Park Tudor robotics team left the encoder logger running on the Panthers' drivetrain
for the entire build season. Every time someone drove the robot around the commons, the
logger appended one line: the number of encoder ticks the wheels turned during that
session. The team captain wants a single number for the banner in the hallway — total
ticks, all season, no rounding. There were a *lot* of sessions, and some of those late
Friday nights racked up an absurd number of ticks, so pick your integer type carefully.

## Input

The first line contains a single integer $n$ — the number of logged sessions.

The second line contains $n$ space-separated integers $t_1, t_2, \dots, t_n$, where $t_i$
is the number of encoder ticks recorded in session $i$.

## Output

Print a single integer on its own line: the total number of encoder ticks, $\sum_{i=1}^{n} t_i$.

## Constraints

- $1 \le n \le 100{,}000$
- $1 \le t_i \le 10^{12}$ for every $i$
- The answer therefore fits in a signed 64-bit integer, but **not** in a 32-bit one.

## Example

Input:

```
5
3000000000 4000000000 5000000000 6000000000 7000000000
```

Output:

```
25000000000
```

Each session is already larger than $2^{31}-1$, and the five of them add to
$25{,}000{,}000{,}000$. In Java this needs `long` (and `Long.parseLong`) — an `int`
would silently wrap around and print garbage.

A second, smaller sample:

```
3
7 250 43
```

outputs `300`, since $7 + 250 + 43 = 300$. Small inputs are still legal, so do not assume
the values are always huge.
