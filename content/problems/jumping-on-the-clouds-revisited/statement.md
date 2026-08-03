# Jumping on the Clouds: Revisited

For the middle school musical, the stage crew in the Fine Arts Building painted a ring of
numbered cloud panels on the floor, and Panther Robotics borrowed the set afterward to
test a hopping robot. Navraj drives, Kylie keeps the battery log, and Mr. Ritz signs off
on each run before the panels go back to the theater. Some panels were painted as storm
clouds for the finale, and the robot's foam feet stick to that paint, so a landing there
drains extra charge. Every run starts on panel 0 with a full battery and ends the moment
the robot lands on panel 0 again.

There are $n$ clouds arranged in a circle and numbered $0$ through $n-1$. Cloud $i$ is
either an ordinary cloud ($c_i = 0$) or a thundercloud ($c_i = 1$), and cloud $0$ is
always ordinary. You start on cloud $0$ with $100$ units of energy and repeatedly jump
exactly $k$ clouds forward: from cloud $i$ you land on cloud $(i + k) \bmod n$. Each jump
costs $1$ unit of energy, and if the cloud you land on is a thundercloud, that landing
costs $2$ additional units. You keep jumping until you land on cloud $0$, and energy is
allowed to drop below zero. Compute the energy remaining at that moment.

## Input

The first line contains two space-separated integers $n$ and $k$: the number of clouds
and the fixed jump length.
The second line contains $n$ space-separated integers $c_0, c_1, \dots, c_{n-1}$, where
$c_i = 1$ if cloud $i$ is a thundercloud and $c_i = 0$ otherwise.

## Output

Print a single integer: the energy remaining when you land back on cloud $0$. This value
may be negative.

## Constraints

- $2 \le n \le 10^5$
- $1 \le k \le n$
- $c_i \in \{0, 1\}$
- $c_0 = 0$

## Example

**Example 1**

Input:
```
8 2
0 0 1 0 0 1 0 0
```
Output:
```
94
```

Starting from cloud $0$ with $k = 2$, the landings are clouds $2$, $4$, $6$, and then
$0$, so the run takes $4$ jumps costing $4$ units. Cloud $2$ is the only thundercloud
visited, adding $2$ more. The remaining energy is $100 - 4 - 2 = 94$.

**Example 2**

Input:
```
6 4
0 0 1 1 1 0
```
Output:
```
93
```

With $n = 6$ and $k = 4$ the landings are cloud $4$, then $(4 + 4) \bmod 6 = 2$, then
$(2 + 4) \bmod 6 = 0$: three jumps costing $3$ units. Clouds $4$ and $2$ are both
thunderclouds, adding $2 + 2 = 4$. The remaining energy is $100 - 3 - 4 = 93$. Note that
$k$ does not have to divide $n$ and clouds $1$, $3$, and $5$ are never visited.
