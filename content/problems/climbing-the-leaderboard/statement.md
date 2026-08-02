# Climbing the Leaderboard

Coding Night ends under the projector leaderboard, and Mr. Ritz insists it use dense
ranking, the same way the Pioneer Conference posts its standings: teams with equal scores
share one rank, and the next lower score takes the very next rank, so a board reading
100, 100, 60 is first, first, second. Last year's final board is still pinned outside
Foster Hall, and between the metal puzzle and set D, Navraj wants to know exactly where
his team would have landed on it after each of this season's four set scores.

You are given the $n$ scores already on a leaderboard, listed from highest to lowest, and
$m$ new scores earned by one player, listed from lowest to highest. For each of the $m$
scores in order, report the rank that score would receive on the leaderboard under dense
ranking: its rank is one more than the number of distinct leaderboard scores strictly
greater than it. Each score is ranked against the original leaderboard; the board is
never modified between queries.

## Input

The first line contains one integer $n$, the number of scores on the leaderboard.
The second line contains $n$ space-separated integers $r_1, r_2, \dots, r_n$, the
leaderboard scores in non-increasing order.
The third line contains one integer $m$, the number of scores the player earned.
The fourth line contains $m$ space-separated integers $p_1, p_2, \dots, p_m$, the
player's scores in non-decreasing order.

## Output

Print $m$ lines. The $j$-th line contains a single integer: the dense rank the score
$p_j$ would hold on the leaderboard.

## Constraints

- $1 \le n \le 2 \times 10^5$
- $1 \le m \le 2 \times 10^5$
- $0 \le r_i \le 10^9$ and $r_i \ge r_{i+1}$ for all $1 \le i < n$
- $0 \le p_j \le 10^9$ and $p_j \le p_{j+1}$ for all $1 \le j < m$

## Example

**Example 1**

Input:
```
5
100 100 60 40 20
4
10 50 70 100
```
Output:
```
5
3
2
1
```

The distinct leaderboard scores are $100, 60, 40, 20$, holding ranks $1, 2, 3, 4$. A
score of $10$ sits below all four distinct scores, so its rank is $4 + 1 = 5$. A score
of $50$ is beaten only by $100$ and $60$, so its rank is $2 + 1 = 3$. A score of $70$ is
beaten only by $100$, giving rank $2$. A score of $100$ is beaten by nothing and ties
the leaders, giving rank $1$.

**Example 2**

Input:
```
4
80 60 60 40
3
40 60 90
```
Output:
```
3
2
1
```

The distinct scores are $80, 60, 40$. A score of $40$ has two distinct scores above it
($80$ and $60$), so its rank is $3$. A score of $60$ ties the pair of $60$s and is
beaten only by $80$, so its rank is $2$. A score of $90$ beats the entire board and
takes rank $1$.
