# SCORING — how a team's score is computed

Written to be checkable by the organizer without reading code. Every number below is reproduced
exactly by `lib/scoring/` and pinned in `fixtures/expected-standings.json`; if this document and the
code ever disagree, that is a bug in one of them and the fixture says which.

**Confirmed by the organizer:** group problem points go **inside** the per-player mean, and side
activity points are added **flat**. The alternate readings remain implemented as config flags so
the decision is reversible without a code change — §4.

---

## 1. The formula

```
teamScore = (sum of ALL player points, group problems included) / teamSize
            + sideActivityPoints
```

Three things about it matter:

1. **The divisor is the team's actual size.** Teams are 2 to 5 players. Dividing by the real size
   is what makes a team of two and a team of five comparable — a bigger team scores more in total
   but not more per player.
2. **Group problems are inside the mean.** A group problem is solved by the team together and
   counts once, but its points join the same pool as individual points before the division.
3. **Side activities are flat.** The metal puzzle, train tracks and Connections are team
   achievements with no per-player component, so dividing them would penalise a big team for
   something it did as a unit.

---

## 2. The worked example

From a real scoring sheet, and pinned as the primary golden fixture.

| Input | Value |
|---|---|
| Player scores | 400, 250, 400, 400 |
| Team size | 4 |
| Group problem | 125 |
| Side activities | 20 + 80 + 50 = 150 |

```
individual sum = 400 + 250 + 400 + 400   = 1450
player pool    = 1450 + 125 (group)      = 1575
mean           = 1575 / 4                =  393.75
teamScore      = 393.75 + 150            =  543.75
```

**Correct answer: 543.75**

### 2.1 The historical spreadsheet answer was 512.5, and it was wrong

The sheet that produced this example computed **512.5**:

```
1450 / 4 + 150 = 362.5 + 150 = 512.5
```

That is the formula with the **group points dropped entirely** — the 125 never enters. The team was
under-credited by 31.25 points.

This is not a rounding disagreement or a difference of interpretation. It is a spreadsheet formula
that missed a cell, and it is the exact class of error this platform exists to eliminate. It is
therefore pinned in `fixtures/expected-standings.json` as a **named wrong answer**, with a test
asserting the engine does **not** reproduce it. A regression that silently reintroduced the old
behaviour would otherwise look like agreement with history.

---

## 3. Exact arithmetic, no floating point

`543.75` is not representable as an integer, and floating point is not acceptable in a scoring
engine. This project has already shipped one float bug: `3 * 0.15 * 250` evaluated to
`112.49999999999999`, truncated to `112` instead of `113`, and cost a student a point.

Scores are therefore computed in **integer hundredths of a point**. `543.75` is stored and compared
as `54375`.

The mean is the only division, and it is done once:

```
poolHundredths = (sum of player points) * 100      -- exact, points are integers
meanHundredths = round(poolHundredths / teamSize)  -- round half away from zero
teamHundredths = meanHundredths + sideActivityPoints * 100
```

For the worked example the division is exact — `157500 / 4 = 39375` — so no rounding occurs. It is
not always exact: a 1000-point pool across 3 players gives `100000 / 3 = 33333.33…`, which rounds to
`33333` hundredths (333.33 points).

**Rounding rule: half away from zero**, applied once, only at the mean. Chosen because it is what a
person doing this by hand does, and because rounding at exactly one place keeps replay
byte-identical.

Two teams whose exact scores differ by less than half a hundredth will tie. That is a real tie and
is displayed as one — §5.

---

## 4. Config flags and their arithmetic

All four are `Contest.config`. The defaults are the organizer-confirmed reading; the alternates
exist so a future organizer can change the format without changing code, and each has its own
golden-fixture variant so switching one is provably correct.

### `groupPointsInsideMean` — default `true`

| Value | Arithmetic | Result |
|---|---|---|
| `true` (default) | `(1450 + 125) / 4 + 150` | **543.75** |
| `false` | `1450 / 4 + 125 + 150` | **637.50** |

With `false`, the group problem's points are added to the team total *after* the mean, so they are
worth `teamSize` times as much — a 125-point group problem contributes 125 to a team of 4 rather
than 31.25. That is a defensible format (it makes the group round decisive) but it is not the one
Coding Night has been running.

### `sideActivitiesFlat` — default `true`

| Value | Arithmetic | Result |
|---|---|---|
| `true` (default) | `(1450 + 125) / 4 + 150` | **543.75** |
| `false` | `(1450 + 125) / 4 + 150 / 4` | **431.25** |

With `false`, side activity points go through the same divisor as everything else.

### `setSelection` — default `RANDOM_ASSIGNED`

| Value | Meaning |
|---|---|
| `RANDOM_ASSIGNED` (default) | Seeded, balanced random assignment per player. No preview, no choice. |
| `PLAYER_CHOOSES` | Each player picks their own set independently. |
| `ONE_SET_PER_TEAM` | The whole team works one set. |

Does not change the arithmetic; changes which problems a player has. Covered here because the
organizer described two formats and both must work.

### `allowReadingUnassignedSets` — default `false`

Whether a player may read a set they were not assigned. **Enforced in the API**, not only hidden in
the UI — a competitor can call the route directly, and a set they can read is a set they can
practise on before their own round.

---

## 5. Ranking

1. `teamScore` DESC
2. total team penalty ASC
3. time of the last score-increasing submission by any member ASC

Any remaining tie is **displayed as a genuine tie**, never broken arbitrarily. Two teams that did
equally well on every tiebreaker did equally well, and inventing a winner would be a lie the
projector tells the room.

---

## 6. Fixture variants

`fixtures/expected-standings.json` carries every result above as a named variant, so flipping a
config flag is a provable change rather than a hoped-for one:

| Variant | Config | Expected |
|---|---|---|
| `primary` | all defaults | 543.75 |
| `groupPointsAfterMean` | `groupPointsInsideMean: false` | 637.50 |
| `sideActivitiesDivided` | `sideActivitiesFlat: false` | 431.25 |
| `historicalSpreadsheetWRONG` | — | 512.50, asserted **not** produced |

Gate **G6** replays these. Its pass condition is not merely "the engine produced a number" but
"replaying twice is byte-identical and every variant matches", because a scoring engine that is
right once and different the second time is worse than one that is wrong consistently.
