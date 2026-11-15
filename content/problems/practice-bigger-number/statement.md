# The Warmer Reading

The science department keeps a thermometer on the roof of the science building. A student reads
it once before first period and once after the last bell, in whole degrees Fahrenheit.

Given the two readings, print the warmer one. If the two readings are equal, print that value.

## Input

One line containing two integers $a$ and $b$, separated by a single space: the morning reading
and the afternoon reading.

## Output

Print one integer, the larger of $a$ and $b$.

## Constraints

- $-1000000 \le a \le 1000000$
- $-1000000 \le b \le 1000000$

## Example

**Example 1**

Input:
```
41 58
```
Output:
```
58
```

The afternoon reading of $58$ degrees is warmer than the morning reading of $41$.

**Example 2**

Input:
```
-3 -9
```
Output:
```
-3
```

Both readings are below zero. $-3$ is warmer than $-9$, so the morning reading is printed.
