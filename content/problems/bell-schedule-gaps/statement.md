# Bell Schedule Gaps

Every Panther's day is a stack of commitments: classes on the bell schedule, an orchestra
sectional, a Science Bowl practice over lunch, a club meeting that the advisor swore would
only take twenty minutes. The scheduling office has them all as blocks of minutes, and some
of the blocks overlap, because the clubs never check with each other before booking a room.

A student wants to know the longest stretch of their day with nothing on it. The day runs
from the first bell to the last bell. A minute is free if no commitment covers it. Find the
largest number of consecutive free minutes anywhere between the two bells, counting the
stretch before the first commitment and the stretch after the last one.

A commitment that starts at minute $l$ and ends at minute $r$ covers the minutes $l$ up to
but not including $r$. Two commitments that touch, one ending at 540 and another starting
at 540, leave no free minute between them.

## Input

The first line contains three integers $n$, $f$ and $g$: the number of commitments, the
minute of the first bell, and the minute of the last bell.

The second line contains $n$ integers $l_1, l_2, \dots, l_n$, the start minute of each
commitment.

The third line contains $n$ integers $r_1, r_2, \dots, r_n$, the end minute of each
commitment. The $i$-th start goes with the $i$-th end. The commitments are in no particular
order.

## Output

Print one integer: the largest number of consecutive free minutes between the first bell
and the last bell. Print $0$ if every minute of the day is covered.

## Constraints

- $1 \le n \le 1000$
- $0 \le f < g \le 1440$
- $f \le l_i < r_i \le g$ for every $i$

## Example

Sample 1 input:

```
4 480 930
480 540 700 660
530 600 760 720
```

Sample 1 output:

```
170
```

The commitments are 480 to 530, 540 to 600, 700 to 760 and 660 to 720. The last two overlap
and together cover 660 to 760. The free stretches are 530 to 540 (10 minutes), 600 to 660
(60 minutes) and 760 to 930 (170 minutes). The longest is 170.

Sample 2 input:

```
3 0 100
0 10 40
30 20 100
```

Sample 2 output:

```
10
```

The commitment from 10 to 20 sits entirely inside the one from 0 to 30, so the first free
minute of the day is minute 30. The only free stretch is 30 to 40, which is 10 minutes.
Looking only at the gap between each commitment and the next one by start time would give
20, which is wrong.
