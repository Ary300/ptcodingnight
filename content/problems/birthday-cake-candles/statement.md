# Birthday Cake Candles

The Hilbert Early Education Center runs one combined birthday party at the end of each
month, and this month the cake landed on Mr. Ritz's supervision shift. The candle box is
a mix of leftovers from years of parties, so the candles come in all sorts of heights,
and the house rule has never changed: the birthday kids get exactly one breath, and one
breath only reaches the candles standing at the very top. Kylie, helping with setup,
wants to know before the singing starts how many candles will actually go out.

You are given the heights of the $n$ candles on the cake. A candle is blown out exactly
when its height equals the height of the tallest candle. Count how many candles share
that maximum height.

## Input

The first line contains one integer $n$, the number of candles on the cake.
The second line contains $n$ space-separated integers $h_1, h_2, \dots, h_n$, where
$h_i$ is the height of the $i$-th candle.

## Output

Print a single integer: the number of candles whose height equals the maximum height on
the cake.

## Constraints

- $1 \le n \le 10^5$
- $1 \le h_i \le 10^7$

## Example

**Example 1**

Input:
```
5
3 1 3 2 3
```
Output:
```
3
```

The tallest candles stand at height $3$. Candles $1$, $3$, and $5$ all have height $3$,
so one breath puts out $3$ candles.

**Example 2**

Input:
```
4
7 6 5 7
```
Output:
```
2
```

The maximum height is $7$, and it appears twice (the first and last candles), so the
answer is $2$. The candles at heights $6$ and $5$ stay lit.
