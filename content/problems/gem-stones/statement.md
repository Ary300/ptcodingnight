# Gemstones

The earth science shelf in the Ruth Lilly Science Center holds a tray of rock samples
collected on class trips around Meridian Hills, and Mr. Ritz wants the tray cataloged
before the next lab section arrives. Kylie and Navraj record each rock as one line of
lowercase letters, one letter per grain of mineral they can identify in it, so a letter
repeats whenever the mineral does. Mr. Ritz calls a mineral a gem mineral if at least one
grain of it turns up in every single rock on the tray, and the cover page of the catalog
is supposed to state how many gem minerals the tray contains.

You are given $n$ strings of lowercase English letters. Call a letter a gem letter if it
occurs at least once in each of the $n$ strings. Count how many of the $26$ lowercase
letters are gem letters.

## Input

The first line contains one integer $n$, the number of rocks.
Each of the next $n$ lines contains one string $r_i$, the composition of the $i$-th rock.

## Output

Print a single integer: the number of distinct letters that appear in every one of the
$n$ strings.

## Constraints

- $1 \le n \le 100$
- $1 \le |r_i| \le 1000$
- each $r_i$ consists of lowercase English letters only

## Example

**Example 1**

Input:
```
3
quartz
topaz
zircon
```
Output:
```
1
```

The letter `z` appears in all three rocks. The letter `a` appears in `quartz` and
`topaz` but not in `zircon`, and `r` appears in `quartz` and `zircon` but not in
`topaz`. No other letter comes close, so exactly $1$ letter is a gem letter.

**Example 2**

Input:
```
4
garnet
amber
beryl
opal
```
Output:
```
0
```

The letters shared by `garnet` and `amber` are `a`, `e`, and `r`. Of those, `beryl`
still contains `e` and `r` but drops `a`, and `opal` contains neither `e` nor `r`.
Nothing survives all four rocks, so the answer is $0$.
