# Day of the Programmer

The Park Tudor CS Club celebrates **Day of the Programmer** on the 256th day of the year (day $2^8$, the number of values that fit in one byte). Ms. Okafor wants a banner printed for every celebration the club has ever held and every one it plans to hold, but nobody can remember which calendar date the 256th day actually lands on, and the answer shifts around in leap years. The robotics team has offered to laser-cut the banners; they just need the dates. Write the program that hands them the list.

## Input

The first line contains an integer $T$, the number of queries.

Each of the next $T$ lines contains two integers $Y$ and $K$, separated by a space: a year and a day number within that year. (The club's own celebration uses $K = 256$, but Ms. Okafor also wants a few other dates checked.)

Use the Gregorian leap-year rule: a year is a leap year if it is divisible by 4 and not by 100, **or** if it is divisible by 400. A leap year has 366 days and February has 29; every other year has 365 days and February has 28.

## Output

Print $T$ lines. On line $i$, print the calendar date of the $K$-th day of year $Y$ in the format `DD.MM.YYYY`, with the day and month zero-padded to exactly two digits and the year written as exactly four digits.

## Constraints

- $1 \le T \le 20000$
- $1600 \le Y \le 9999$
- $1 \le K \le 366$, and $K$ never exceeds the number of days in year $Y$.

## Example

**Input**

```
3
2024 256
2023 256
2024 60
```

**Output**

```
12.09.2024
13.09.2023
29.02.2024
```

2024 is a leap year, so January through August use up $31+29+31+30+31+30+31+31 = 244$ days; day 256 is therefore 12 days into September. In 2023 February is one day shorter, so the same day number falls one date later, on 13 September. Day 60 of 2024 is the leap day itself: 31 days of January plus 29 of February is exactly 60.

**Second sample**

Input `2 / 1900 60 / 2000 60` (one query per line) prints `01.03.1900` then `29.02.2000`: 1900 is divisible by 100 but not 400, so it is *not* a leap year and has no 29 February, while 2000 is divisible by 400 and does.
