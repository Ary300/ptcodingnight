# Jim and the Orders

The cider store on campus still presses apples from the days when the 68 acres at 7200 N.
College Avenue were the Lilly family orchard, and on the Saturday of the fall festival it
is the busiest counter at Park Tudor. Jim works the register alone. Orders reach him from
the walk-up line, from the phone and from the boosters' table, and he numbers them from 1
in the order they land on his notepad, which is not always the order they were placed: a
phone order placed at 8:05 can be written down after a walk-up order placed at 8:10. Each
drink goes on the press at the time its order was placed and takes a known number of
minutes. Jim calls out each ticket the minute its drink is finished, and when two drinks
finish in the same minute he calls the lower ticket number first, because arguing with a
line of Panthers fans is not worth it.

There are $n$ orders, numbered $1$ through $n$ in the order they appear in the input. Order
$i$ is placed at time $t_i$ and takes $d_i$ minutes to prepare, so it is finished at time
$t_i + d_i$. The times $t_i$ are in no particular order. Orders are handed out in
increasing order of finish time. If two orders finish at the same time, the one with the
smaller order number (its position in the input) is handed out first, even when the other
one was placed earlier. The tie never breaks on $t_i$. Print the order numbers in the
sequence they are handed out.

## Input

The first line contains one integer $n$, the number of orders.
Each of the next $n$ lines contains two space-separated integers $t_i$ and $d_i$: the
time order $i$ is placed and the number of minutes it takes to prepare.

## Output

Print $n$ space-separated integers on one line: the order numbers, in the sequence the
orders are handed out.

## Constraints

- $1 \le n \le 10^5$
- $1 \le t_i \le 10^6$
- $1 \le d_i \le 10^6$

## Example

**Example 1**

Input:
```
3
8 1
4 2
5 6
```
Output:
```
2 1 3
```

Order $1$ was written down first even though order $2$ was placed earlier. Order $1$ is
finished at time $8 + 1 = 9$, order $2$ at $4 + 2 = 6$, and order $3$ at
$5 + 6 = 11$. Sorted by finish time that is $6, 9, 11$, so the tickets are called in the
sequence $2, 1, 3$.

**Example 2**

Input:
```
5
1 3
2 2
3 1
10 2
1 1
```
Output:
```
5 1 2 3 4
```

The finish times are $4, 4, 4, 12, 2$. Order $5$ finishes first at time $2$. Orders $1$,
$2$, and $3$ all finish at time $4$, so the tie-break applies and they are called in
ticket order: $1$, then $2$, then $3$. Order $4$ finishes last at time $12$. Order $5$
was placed at time $1$, well before order $4$, and still carries the number $5$ because it
is the fifth order listed in the input.
