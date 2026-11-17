# Hall Pass Ledger

The front desk of the Upper School keeps a hall pass ledger on a clipboard. A student who
leaves class for the nurse, the library, or a forgotten calculator signs the ledger on the
way out, and signs it again on the way back in. Each signature is one line: the student's
name and the minute of the school day. Nobody writes "out" or "in", because the clipboard
has no column for it. A student's first signature of the day means they went out, their
second means they came back, their third means they went out again, and so on.

At closing time the dean wants one number per student: how many minutes that student spent
out of class in total. A student whose last signature was an "out" is still in the hallway
when the ledger closes, and that final trip counts up to the closing minute.

## Input

The first line contains two integers $n$ and $c$: the number of signatures in the ledger
and the closing minute.

The second line contains $n$ names, separated by spaces, in the order they were signed.
Each name is a string of lowercase English letters.

The third line contains $n$ integers $m_1, m_2, \dots, m_n$, where $m_i$ is the minute of
the $i$-th signature. The ledger is chronological, so $m_1 \le m_2 \le \dots \le m_n$.

## Output

Print one line for every distinct name in the ledger, in alphabetical order. Each line
holds the name, a space, and the total number of minutes that student spent out.

## Constraints

- $1 \le n \le 1000$
- $1 \le c \le 1440$
- $0 \le m_i \le c$ for every $i$
- Each name has between $1$ and $12$ lowercase letters.

## Example

Sample 1 input:

```
7 600
maya tobias maya priya tobias priya maya
480 485 492 500 510 530 590
```

Sample 1 output:

```
maya 22
priya 30
tobias 25
```

Maya signs out at minute 480 and back in at 492, which is 12 minutes. Tobias is out from
485 to 510, 25 minutes. Priya is out from 500 to 530, 30 minutes. Maya signs out again at
590 and never signs back in, so that trip runs until the ledger closes at 600 and adds 10
more minutes, for a total of 22.

Sample 2 input:

```
3 300
eli eli ana
100 100 250
```

Sample 2 output:

```
ana 50
eli 0
```

Eli signs out and back in during the same minute, so his total is 0. Ana signs out at 250
and is still out when the ledger closes at 300. Names print alphabetically, so `ana` comes
before `eli` even though Eli signed first.
