# Designer PDF Viewer

The Park Tudor yearbook staff exports everything as PDFs, and the highlighter tool in their
reader is stubbornly literal. Every letter in their display font is exactly $1$ mm wide, but
each of the $26$ lowercase letters has its own height. When you highlight a word, the reader
does not hug the letters: it paints one plain rectangle across the whole word, tall enough
to cover the tallest letter in it. The staff wants to know how much yellow ink each highlight
will cost before they print.

## Input

The first line contains $26$ space-separated integers $h_1, h_2, \dots, h_{26}$, the heights
in millimetres of the letters `a` through `z`, in that order.
The second line contains one integer $q$, the number of words to highlight.
Each of the next $q$ lines contains one word, made only of lowercase English letters.

## Output

Print $q$ lines. On line $i$, print the area in mm$^2$ of the rectangle the reader paints
over word $i$. That area is the word's length in letters multiplied by the height of the
tallest letter in that word.

## Constraints

- $1 \le h_j \le 20$ for every $j$
- $1 \le q \le 500$
- Each word has length between $1$ and $500$ and contains only characters `a`–`z`

## Example

**Example 1**

Input:
```
1 3 1 3 1 4 1 5 2 5 1 3 1 1 1 3 4 1 1 3 1 5 1 5 1 5
2
panther
cs
```
Output:
```
35
2
```

In `panther` the tallest letter is `h` at $5$ mm, and the word is $7$ letters wide, so the
rectangle is $7 \times 5 = 35$. In `cs` both letters are only $1$ mm tall, giving
$2 \times 1 = 2$.

**Example 2**

Input:
```
4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4
1
night
```
Output:
```
20
```

Every letter in this font is $4$ mm tall, so the height of the rectangle is $4$ no matter
which letters appear, and the $5$-letter word covers $5 \times 4 = 20$ mm$^2$.
