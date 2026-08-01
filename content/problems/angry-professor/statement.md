# Angry Professor

Mr. Okafor runs the 6:45 a.m. Panther Robotics warm-up in the makerspace, and he is famously
unsentimental about latecomers. Before each session he decides on a quorum: if at least $K$
students are already sitting down when the clock hits 6:45, the session runs. If fewer than
$K$ have made it, he flips the lights back off, mutters something about the bus schedule, and
goes to get coffee. You have the sign-in log for a whole week of sessions and want to know
which ones actually happened.

## Input

The first line contains an integer $T$, the number of sessions.

Each session is described by two lines:

- A line with two integers $N$ and $K$: the number of students on the roster for that
  session and the quorum Mr. Okafor set.
- A line with $N$ integers $a_1, a_2, \dots, a_N$: each student's arrival time in minutes
  relative to 6:45. A negative value means the student arrived early, $0$ means they arrived
  exactly on time, and a positive value means they arrived late.

A student counts toward the quorum if and only if $a_i \le 0$.

## Output

Print one line per session, in input order: `HELD` if at least $K$ students counted toward
the quorum, or `CANCELLED` if fewer than $K$ did.

## Constraints

- $1 \le T \le 100$
- $1 \le N \le 1000$
- $1 \le K \le N$
- $-60 \le a_i \le 60$

## Example

**Input**

```
2
4 3
-1 0 2 5
3 1
1 -4 9
```

**Output**

```
CANCELLED
HELD
```

In the first session, only two students ($-1$ and $0$) were seated by 6:45, which is short of
the quorum of $3$, so Mr. Okafor cancels. In the second session the quorum is only $1$, and
the student who arrived $4$ minutes early is enough on their own, so the session is held.

A second sample shows the boundary case where every student arrives exactly on time and the
quorum equals the full roster: the input `1` / `5 5` / `0 0 0 0 0` prints `HELD`, because
arriving at exactly $0$ still counts.
