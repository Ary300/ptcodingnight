# Marc's Cakewalk

The cider store on Park Tudor's campus is a holdover from the Lilly family apple orchard
that the school's 68 acres used to be, and every October it sells cupcakes next to the
cider. Zain left it with a full box and a plan: eat every cupcake, then walk laps around
campus until the calories are gone. The catch is that each cupcake makes the next one
harder to walk off. For every cupcake he has already eaten, the next one costs twice as
many miles per calorie, so the order he eats them in decides how far he walks.

Zain has $n$ cupcakes, and the $i$-th cupcake contains $c_i$ calories. He eats all $n$
cupcakes, one at a time, in an order of his choosing. If a cupcake containing $c$ calories
is the $j$-th cupcake he eats (counting from $j = 0$), walking it off costs $2^j \cdot c$
miles. Compute the minimum total number of miles Zain must walk, taken over every possible
eating order.

## Input

The first line contains one integer $n$, the number of cupcakes.
The second line contains $n$ space-separated integers $c_1, c_2, \dots, c_n$, where $c_i$
is the calorie count of the $i$-th cupcake.

## Output

Print a single integer: the minimum total number of miles. The answer can exceed the range
of a 32-bit integer, so use a 64-bit type; it always fits in a signed 64-bit integer.

## Constraints

- $1 \le n \le 40$
- $1 \le c_i \le 1000$

## Example

**Example 1**

Input:
```
3
1 3 2
```
Output:
```
11
```

Eating the cupcakes from most caloric to least means eating $3$, then $2$, then $1$. That
costs $2^0 \cdot 3 + 2^1 \cdot 2 + 2^2 \cdot 1 = 3 + 4 + 4 = 11$ miles, and no order does
better. For comparison, eating them in the order $1, 2, 3$ would cost
$2^0 \cdot 1 + 2^1 \cdot 2 + 2^2 \cdot 3 = 1 + 4 + 12 = 17$ miles.

**Example 2**

Input:
```
4
7 4 9 6
```
Output:
```
79
```

The best order is $9, 7, 6, 4$, which costs
$2^0 \cdot 9 + 2^1 \cdot 7 + 2^2 \cdot 6 + 2^3 \cdot 4 = 9 + 14 + 24 + 32 = 79$ miles.
