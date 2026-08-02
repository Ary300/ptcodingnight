# Counting Valleys

The trail behind the cider store loops the low ground at the edge of Park Tudor's 68
acres, the land that was once the Lilly family's apple orchard. Mr. Ritz walks the loop
every morning before school wearing a fitness tracker that records exactly one thing per
stride: whether that stride went up one meter or down one meter. The tracker is calibrated
so the trailhead sits at elevation zero, and because the trail is a loop, he always ends
the walk back at elevation zero. Kylie, who builds the telemetry dashboards for Panther
Robotics, agreed to add one statistic to his morning summary: how many valleys the walk
passed through.

You are given the step log as a string of $n$ characters, read left to right. Each
character changes the current elevation by exactly one unit: `U` raises it by one and `D`
lowers it by one. The elevation starts at $0$ and is guaranteed to end at $0$. A valley is
a maximal consecutive stretch of the walk spent strictly below elevation $0$: it begins
with a `D` step taken from elevation $0$ and ends with the `U` step that brings the
elevation back to $0$. Count how many valleys the walk contains.

## Input

The first line contains one integer $n$, the number of steps in the log.
The second line contains a string of exactly $n$ characters, each of which is `U` or `D`.

## Output

Print a single integer: the number of valleys in the walk.

## Constraints

- $2 \le n \le 10^6$
- $n$ is even
- The string contains exactly $n/2$ characters `U` and $n/2$ characters `D`, so the walk
  ends at elevation $0$

## Example

**Example 1**

Input:
```
10
DDUUDDUDUU
```
Output:
```
2
```

The elevation after each of the $10$ steps is $-1, -2, -1, 0, -1, -2, -1, -2, -1, 0$. The
walk drops below elevation $0$ on step $1$ and climbs back to $0$ on step $4$: that is one
valley. It drops below again on step $5$ and returns to $0$ on step $10$: a second valley.
The dip from $-1$ down to $-2$ inside that second stretch does not start a new valley,
because the walk never reached elevation $0$ in between. The answer is $2$.

**Example 2**

Input:
```
8
UUDDUUDD
```
Output:
```
0
```

The elevation after each step is $1, 2, 1, 0, 1, 2, 1, 0$. The walk climbs two hills but
never goes below elevation $0$, so it contains $0$ valleys.
