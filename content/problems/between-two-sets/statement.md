# Between Two Sets

The cider store on the Park Tudor campus still sells apples from the trees the Lilly
family orchard left behind, and every October it takes deliveries faster than anyone can
shelve them. Mr. Ritz supervises the student volunteers on restocking duty, which this
fall means Kylie and Zain. Apples arrive banded into bundles of a few fixed sizes, and
the display trays out front each hold a fixed count. To keep the work mindless, Mr. Ritz
wants to settle on one stack size for the whole shift: every stack must be assembled from
whole bundles of each incoming size, and a whole number of stacks must exactly fill each
tray. Before Kylie and Zain argue about which stack size to use, they want to know how
many sizes even qualify.

You are given two lists of positive integers, $a_1, a_2, \dots, a_n$ and
$b_1, b_2, \dots, b_m$. Count the positive integers $x$ such that every element of the
first list divides $x$ (that is, $x$ is a multiple of each $a_i$), and $x$ divides every
element of the second list (that is, each $b_j$ is a multiple of $x$).

## Input

The first line contains two space-separated integers $n$ and $m$, the lengths of the two
lists.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.
The third line contains $m$ space-separated integers $b_1, b_2, \dots, b_m$.

## Output

Print a single integer: the number of positive integers $x$ that are a multiple of every
$a_i$ and a divisor of every $b_j$.

## Constraints

- $1 \le n \le 10$
- $1 \le m \le 10$
- $1 \le a_i \le 100$
- $1 \le b_j \le 100$

## Example

**Example 1**

Input:
```
2 3
2 4
16 32 96
```
Output:
```
3
```

A qualifying $x$ must be a multiple of both $2$ and $4$, so it must be a multiple of $4$.
It must also divide $16$, $32$, and $96$. Checking the multiples of $4$ up to $16$:
$4$ divides all three, $8$ divides all three, $12$ does not divide $16$, and $16$ divides
all three. That gives $x \in \{4, 8, 16\}$, so the answer is $3$.

**Example 2**

Input:
```
2 2
3 9
54 81
```
Output:
```
2
```

Here $x$ must be a multiple of $3$ and of $9$, so a multiple of $9$, and it must divide
both $54$ and $81$. Testing multiples of $9$: $x = 9$ divides $54$ and $81$; $x = 18$
divides $54$ but not $81$; $x = 27$ divides both; anything larger than $27$ cannot divide
both, since $27$ is the largest number dividing $54$ and $81$. Only $9$ and $27$ work, so
the answer is $2$.
