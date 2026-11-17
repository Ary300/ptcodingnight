# Library Shelf Shuffle

The Park Tudor library has one return cart, and it fills up fast on the last day before
a break. Returned books get dropped on the cart one at a time, each one landing on top of
whatever is already there. Whenever a student volunteer has a free minute, they lift the
top book off the cart and walk it back to its shelf. They never dig for a book lower down,
because the pile would topple.

The librarian kept a log of the afternoon as a sequence of events, in order. She wants to
know which book went back to the shelves at each volunteer visit, so she can check the
reshelving against the catalog.

## Input

The first line contains an integer $n$, the number of events in the log.

The second line contains $n$ integers $e_1, e_2, \dots, e_n$, one per event, in the order
they happened:

- If $e_i > 0$, a book with call number $e_i$ was placed on top of the cart.
- If $e_i = 0$, a volunteer came by and took the top book off the cart.

Two different copies of the same title can both be returned, so the same call number may
appear more than once.

## Output

Print one line for each event with $e_i = 0$, in the order those events happened. The line
holds the call number of the book the volunteer took. If the cart was empty when the
volunteer arrived, print `empty` instead; the volunteer leaves and the cart stays empty.

## Constraints

- $1 \le n \le 1000$
- $0 \le e_i \le 10^6$
- At least one event has $e_i = 0$.

## Example

Sample 1 input:

```
7
41 17 0 0 0 23 0
```

Sample 1 output:

```
17
41
empty
23
```

Book 41 goes on the cart, then book 17 lands on top of it. The first volunteer takes the top
book, 17, and the second takes 41. The third volunteer finds nothing on the cart, so that
line reads `empty`. Book 23 is returned next, and the last volunteer takes it.

Sample 2 input:

```
5
0 5 5 0 0
```

Sample 2 output:

```
empty
5
5
```

The very first event is a volunteer visit to an empty cart. Then two copies of book 5 are
returned, and the two remaining visits take one copy each.
