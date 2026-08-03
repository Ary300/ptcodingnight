# Booked Solid in Ayres

Ayres Auditorium is the most contested room on campus. The winter musical wants the stage,
Science Bowl wants the podium microphones, Panther Robotics wants the floor space for a
drive test, and the Coding Night organizers want an evening to lay out the team tables.
Mr. Ritz keeps the booking ledger, and every request goes in as a pair of minute marks
measured from the moment the ledger was opened, so the numbers run large. Kylie, who
answers the booking email, suspects that some weeks the ledger promises the auditorium to
several groups at once, and she wants two facts before the next scheduling meeting: how
bad the worst pile-up gets, and how much time the room is genuinely spoken for.

You are given $n$ bookings. Booking $i$ holds the auditorium from minute $s_i$ up to but
not including minute $e_i$, so a booking that ends at minute $t$ and another that begins
at minute $t$ do not conflict. Report two numbers: the maximum number of bookings that are
all active at a single moment, and the total number of minutes during which at least one
booking is active, counting each minute once no matter how many bookings cover it.

## Input

The first line contains one integer $n$, the number of bookings in the ledger.
Each of the next $n$ lines contains two integers $s_i$ and $e_i$, the start and end minute
of the $i$-th booking.

## Output

Print two lines. The first line contains the maximum number of bookings active at any
single moment. The second line contains the total number of distinct minutes covered by at
least one booking.

## Constraints

- $1 \le n \le 10^5$
- $0 \le s_i < e_i \le 10^9$

## Example

**Example 1**

Input:
```
4
0 30
20 40
25 35
60 90
```
Output:
```
3
70
```

From minute $25$ up to minute $30$ the first three bookings are all active at once, and no
moment does better, so the peak is $3$. The covered minutes form $[0, 40)$ and $[60, 90)$,
which is $40 + 30 = 70$ distinct minutes.

**Example 2**

Input:
```
3
10 20
20 30
5 10
```
Output:
```
1
25
```

The bookings tile the ledger back to back: $[5, 10)$, then $[10, 20)$, then $[20, 30)$.
An end at minute $10$ and a start at minute $10$ do not conflict, so no moment ever has
more than one active booking, and the covered stretch $[5, 30)$ is $25$ minutes.
