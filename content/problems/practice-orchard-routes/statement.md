# Orchard Routes

Park Tudor's campus at 7200 N. College Avenue sits on land that was once the Lilly
family apple orchard, and the cider store in the far corner of the property still
presses every fall. For a Tribune feature on the orchard's history, Navraj has redrawn
the original planting survey as a grid of square plots: the survey marker stands on the
northwest plot, the cider store on the southeast plot, and some plots still hold
century-old apple trees that no walking route is allowed to cut through.

A walking route starts on the northwest plot, ends on the southeast plot, and moves one
plot at a time, always either one plot south or one plot east, never entering a plot
that holds a tree. Navraj wants to caption the map with the number of distinct walking
routes. That number grows far too quickly to print in full, so report it modulo
$10^9 + 7$.

## Input

The first line contains two integers $r$ and $c$, the number of rows and columns of the
survey grid.
Each of the next $r$ lines contains a string of exactly $c$ characters describing one
row of the grid from north to south: `.` marks an open plot and `#` marks a plot with a
tree.

## Output

Print a single integer: the number of distinct walking routes from the plot in row $1$,
column $1$ to the plot in row $r$, column $c$, taken modulo $10^9 + 7$. If no such
route exists, including the case where either endpoint holds a tree, print $0$.

## Constraints

- $1 \le r, c \le 1000$
- Each grid character is either `.` or `#`.

## Example

**Example 1**

Input:
```
3 3
...
.#.
...
```
Output:
```
2
```

Without the tree there would be $\binom{4}{2} = 6$ routes. Four of them pass through
the center plot, which holds a tree, leaving two: east, east, south, south along the
north and east edges, and south, south, east, east along the west and south edges.

**Example 2**

Input:
```
2 2
.#
#.
```
Output:
```
0
```

Only two routes are conceivable in a $2 \times 2$ grid. Going east first enters the
blocked northeast plot, and going south first enters the blocked southwest plot, so no
route survives and the answer is $0$.
