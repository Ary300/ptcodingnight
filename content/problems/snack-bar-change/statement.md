# Snack Bar Change

At halftime of a home basketball game the snack bar sells exactly one thing: a Panther
pretzel for 1 dollar. Students line up and each one pays with a single bill, which is a
1-dollar, 2-dollar or 5-dollar bill. The cashier has to hand back exact change from the
drawer before moving on to the next person in line, so a 2-dollar bill gets 1 dollar back
and a 5-dollar bill gets 4 dollars back. Every bill a student hands over goes into the
drawer and can be used as change for anyone behind them. A 5-dollar bill is never useful as
change, since nobody is owed that much.

Before the game the cashier puts a small float in the drawer: some 1-dollar bills and some
2-dollar bills. The cashier is good at this job. Whenever there is more than one way to make
change, they pick the way that keeps the line moving for as long as possible.

For each game, work out whether the whole line gets served. If some student cannot be
given exact change no matter how well the cashier handled everyone before them, the line
stops at that student.

## Input

The first line contains an integer $t$, the number of games.

Each game is described by two lines:

- A line with three integers $n$, $p$ and $q$: the number of students in line, the number of
  1-dollar bills in the float, and the number of 2-dollar bills in the float.
- A line with $n$ integers $b_1, b_2, \dots, b_n$, each equal to $1$, $2$ or $5$: the bill
  the $i$-th student in line pays with.

## Output

Print one line per game, in input order. Print `ok` if every student in line is served.
Otherwise print the position of the first student who cannot be given exact change, counting
from $1$ at the front of the line.

## Constraints

- $1 \le t \le 5$
- $1 \le n \le 1000$
- $0 \le p, q \le 1000$
- Each $b_i$ is $1$, $2$ or $5$.

## Example

Sample 1 input:

```
2
5 0 0
1 1 2 5 1
4 1 0
2 1 1 5
```

Sample 1 output:

```
4
ok
```

In the first game the drawer starts empty. The first two students pay with 1-dollar bills,
so the drawer holds two of them. The third pays with a 2 and gets one of the 1s back,
leaving one 1-dollar bill and one 2-dollar bill. The fourth student pays with a 5 and is
owed 4 dollars, but the drawer only holds 3 dollars in total, so the line stops at student 4.

In the second game the float is a single 1-dollar bill. Student 1 pays with a 2 and takes
that 1 as change. Students 2 and 3 each pay with a 1. Student 4 pays with a 5 and is owed
4 dollars, which the cashier makes as one 2-dollar bill plus two 1-dollar bills. Everyone
is served.

Sample 2 input:

```
1
7 0 0
1 1 1 1 2 5 2
```

Sample 2 output:

```
ok
```

After the first five students the drawer holds three 1-dollar bills and one 2-dollar bill.
Student 6 pays with a 5 and is owed 4 dollars. Handing back four 1-dollar bills would be
exact, but then student 7, paying with a 2, could not get the 1 dollar they are owed. The
cashier instead hands back the 2-dollar bill and two 1-dollar bills, keeping one 1-dollar
bill for student 7, and the whole line is served.
