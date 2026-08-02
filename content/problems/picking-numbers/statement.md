# Picking Numbers

Park Tudor's sixty-eight acres were once the Lilly family's apple orchard, and the cider
store near the front of campus still presses fruit from the rows that survived the
construction of Foster Hall. Every October Mr. Ritz walks a crew of volunteers, Kylie,
Dominic, and Zain among them, out to the old trees, and each picked apple gets a firmness
grade from a handheld tester before it goes in a crate. The press only accepts a uniform
batch: every apple in it must be within one grade point of every other apple in the batch,
or the cider comes out uneven. Before anyone starts hauling crates, Mr. Ritz wants to know
the largest batch the day's harvest can possibly supply.

You are given a list of $n$ integers. Choose as many of them as possible, counting each
occurrence separately, so that any two chosen values differ by at most $1$. Print the size
of the largest such selection.

## Input

The first line contains one integer $n$, the number of values in the list.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print a single integer: the maximum number of values you can choose so that every pair of
chosen values differs by at most $1$.

## Constraints

- $1 \le n \le 10^5$
- $1 \le a_i \le 100$

## Example

**Example 1**

Input:
```
7
8 9 9 7 8 10 8
```
Output:
```
5
```

Grade $8$ appears three times and grade $9$ appears twice. Choosing all five of them is
valid, since $8$ and $9$ differ by exactly $1$. Nothing larger works: adding the $7$ would
pair it with a $9$ (difference $2$), and adding the $10$ would pair it with an $8$
(difference $2$).

**Example 2**

Input:
```
6
40 42 40 44 40 42
```
Output:
```
3
```

The three $40$s form a valid selection of size $3$. The values $40$ and $42$ differ by
$2$, so they can never be chosen together, and there are no $39$s or $41$s to extend the
$40$s. The two $42$s only reach size $2$ (a $44$ next to a $42$ would differ by $2$), so
the answer is $3$.
