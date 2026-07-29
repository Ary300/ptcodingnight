# Save the Prisoner!

The Panthers robotics team is stuck in the lab until the drivetrain is finished, so Coding
Night ordered pizza. The seats around the big round table are numbered $1$ through $n$
clockwise, and the box gets opened at seat $s$. Slices are handed out one at a time, going
clockwise, one slice per seat, wrapping from seat $n$ back to seat $1$ as many times as it
takes. Whoever accepts the **last** slice is the one who has to carry the empty boxes down
to the dumpster, so everyone at the table wants to know that seat number in advance.

## Input

The first line contains one integer $q$, the number of tables to analyse.

Each of the next $q$ lines contains three space-separated integers $n$, $m$, and $s$: the
number of seats at that table, the number of slices to hand out, and the seat where the
first slice goes.

## Output

Print $q$ lines. Line $i$ is the number of the seat that receives the last slice at table
$i$.

## Constraints

- $1 \le q \le 100000$
- $1 \le n \le 10^9$
- $1 \le m \le 10^9$
- $1 \le s \le n$

## Example

Sample 1 input

```
2
5 8 3
4 4 4
```

Sample 1 output

```
5
3
```

At the first table the slices land on seats $3, 4, 5, 1, 2, 3, 4, 5$ — eight slices, and the
eighth one stops on seat $5$. At the second table the four slices go to seats $4, 1, 2, 3$,
so seat $3$ takes out the boxes.

Sample 2 input

```
1
1 1000 1
```

Sample 2 output

```
1
```

A table with a single seat means that lonely seat gets every slice, last one included.

Note that seat numbers wrap around, so an answer is never larger than $n$.
