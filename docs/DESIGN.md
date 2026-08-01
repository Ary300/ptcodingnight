# DESIGN — Park Tudor Coding Night

The token system. Written **before** any frontend agent starts (Phase 4a), so all three
build against real values from their first commit rather than default Tailwind.

Nothing here is invented. The palette and both text faces are Park Tudor's own, pulled from
`parktudor.org`'s stylesheet; every contrast claim below is a measured WCAG ratio, not an
impression. Where a value is my choice rather than the school's, it says so.

---

## 1. Where these values come from

Fetched from `https://www.parktudor.org/uploaded/themes/default_25/main.css`. The theme
carries its own published swatch list (`.colors ol li:nth-of-type(n)`), which is the
school's brand palette stated in its own words:

```
1  #C63527   7  #7C878E
2  #95271A   8  #A69F88
3  #0086BF   9  #4F4646
4  #FED141  10  #727272
5  #49C5B1  12  #1A0606
6  #FF9D6E
```

The theme also names their roles directly — `.solid-primary` is `#C63527`,
`.solid-secondary` is `#95271A`, `.solid-dark` is `#1A0606` — so the primary red is not a
guess. The crest SVG independently uses `#C63628`, one digit off the CSS primary; that
drift is theirs, and we standardise on the CSS value.

Typefaces in the same stylesheet: **Open Sans** (113 declarations) and **Libre Baskerville**
(40). Both are SIL OFL and self-hostable, which matters because the night has no internet.

---

## 2. Palette — six named values

```css
--ink:     #1A0606;   /* brand near-black, warm red cast */
--paper:   #FBF9F8;   /* warm off-white, derived (see note) */
--panther: #C63527;   /* brand primary — identity, chrome, focus */
--gold:    #FED141;   /* brand accent — frozen state, champion, urgency */
--rise:    #49C5B1;   /* brand teal — rank gained */
--fall:    #FF9D6E;   /* brand coral — rank lost */
```

Five of the six are the school's verbatim. `--paper` is the one derivation: pure `#FFFFFF`
next to a warm near-black reads clinical, so it is warmed very slightly. Everything else is
untouched.

`#95271A` (their secondary) is available as a derived pressed/hover shade of `--panther`,
not a seventh token — one red is enough to carry identity, and a second invites agents to
choose arbitrarily between them.

### Measured contrast — this is what decides where each colour may be used

| Colour | on `--ink` | on `--paper` |
|---|---|---|
| `--paper` | **18.65** AAA | — |
| `--gold` | **13.44** AAA | 1.39 ✗ |
| `--fall` | **9.60** AAA | 1.94 ✗ |
| `--rise` | **9.23** AAA | 2.02 ✗ |
| `--panther` | 3.67 (large only) | **5.08** AA |
| `#95271A` derived | 2.41 ✗ | **7.75** AAA |

Two rules fall straight out of that table, and they are not stylistic:

1. **`--gold`, `--rise` and `--fall` are dark-surface-only.** All three fail badly on paper.
   They belong to the projector and to dark panels, never as text on a light background.
2. **`--panther` is never small text on `--ink`.** At 3.67 it clears large-text AA and
   nothing else. On the projector it is chrome — rules, rails, the frozen plate border — not
   copy. On paper it is fine for text at 5.08.

### The accent has a job list, and it is short

Measured across the product before this rule existed: **51 of 90 uses of `--panther` were
`text-panther` at full strength**, and it was simultaneously the brand mark, the step numbers on
the home page, the rail on every admin card, the set letter, the Solved dot, the Override button,
every link in body copy, and the active nav underline. A colour that means eight things means
nothing, and the cost is not aesthetic: when everything on `/admin/console` is red, the organizer
cannot see which control is the one they came for.

> **`--panther` marks identity, the one primary action on a screen, and a destructive action.
> Nothing else.**

The third is a stated exception rather than something to be inferred. A red button for a
destructive, audit-logged act — a verdict override — is a convention old enough that removing it
would cost more than it saved, and `Button`'s `danger` variant is the only place it is spent.

Everything that lost the accent differentiates by **weight** instead, which is the only lever
available on `--panther` anyway: at 5.08:1 on paper, any alpha on it fails AA, so there is no
such thing as a "lighter panther" that is still legible. Specifically dropped: the numbered steps
on the home page, the rail on every admin card (see §5 — `Rail`'s `brand` state is division
identity, not page furniture), links in body copy (underline plus inherited colour), and the
Solved dot, which was already required by §3 to carry a second channel and now carries only it —
a filled ring versus a hollow one.

---

## 3. The finding that shapes the leaderboard

**`--rise` and `--fall` differ in luminance by a factor of 1.04.** They are near-identical
in brightness and separated almost entirely by hue.

A classroom projector is a low-contrast, colour-shifted device, and roughly 1 in 12 boys in
the room has a colour-vision deficiency. So:

> **Rank change is never encoded by colour alone.** Every delta carries a glyph and a
> position change. Colour is the third channel, never the first.

Concretely, each standings row shows `↑3` / `↓2` / `−` in a dedicated monospace column,
*and* physically moves, *and* tints its rail. Remove the colour entirely and the board still
reads correctly — that is the test.

> **Use `↑` U+2191, `↓` U+2193 and `−` U+2212 — not `▲` U+25B2, `▼` U+25BC or `—` U+2014.**
> The first three are inside the Latin subset of the vendored woff2 files; the second three
> are not, and would silently fall back to whatever system font the projector machine
> happens to have. That means mismatched metrics in a monospace column, or a tofu box on the
> one screen everybody is looking at. Verified against
> `public/fonts/manifest.json`.

Teal-versus-coral was kept over the obvious red-green pair for two reasons: red is already
spoken for as the school's identity colour and would be ambiguous the moment it also meant
"you dropped", and blue-green versus orange survives both protanopia and deuteranopia, which
red-green does not.

---

## 4. Type

| Role | Face | Why |
|---|---|---|
| Display | **Libre Baskerville** | The school's own serif. Sturdy strokes and a large x-height — it was drawn for screens, not lifted from metal — so it survives projection where a fashionable high-contrast didone would fall apart. Carries the crest's formality. |
| Body | **Open Sans** | The school's own sans. Unremarkable on purpose: competitors are reading problem statements and writing code, and the UI's job there is to disappear. |
| Mono | **JetBrains Mono** | My choice; the school has no monospace. Drawn for code, and it disambiguates `0/O` and `1/l/I`, which matters when a student is comparing their output against expected I/O character by character. |

All three self-hosted as `woff2` under `public/fonts/`. **No `next/font/google`, no CDN** —
a webfont request is a network dependency, and the night has no internet.

All three are variable fonts, so one file per subset covers every weight: six files,
194 KB total, listed in `public/fonts/manifest.json` with their axes and unicode ranges.
Declare `font-weight` as the full range in `@font-face` (Open Sans 300–800, Libre Baskerville
400–700, JetBrains Mono 100–800) — declaring a single weight makes the browser synthesise
the others, which is faux-bold on a face that ships a real one.

### Why the numbers are monospace, not Baskerville

Standings columns must not jitter as digits change. Libre Baskerville has no tabular
figures; a proportional `1` is narrower than a `4`, so every score update would shift the
column and every rank animation would look like a glitch. **All numerals on the leaderboard —
rank, score, penalty, countdown — are JetBrains Mono.** Names are Baskerville. The pairing is
deliberate: formal serif for people, precise mono for quantities.

### Two scales, because two viewing distances

A competitor reads a phone at 30 cm. The back row reads a projector at 10 m. One scale
cannot serve both, and stretching one to try is how projector UIs end up looking like
zoomed-in web pages.

**App** — base 16px. **Not a single ratio, and that is the point:**

```css
--text-xs:  0.80rem;  /* 12.8px  metadata, timestamps */
--text-sm:  1.00rem;  /* 16px    body, form labels, dense chrome */
--text-md:  1.25rem;  /* 20px    problem statement body */
--text-lg:  1.75rem;  /* 28px    problem title, section head */
--text-xl:  2.50rem;  /* 40px    page heading */
--text-2xl: 3.50rem;  /* 56px    contest name, hero */
```

The bottom three are still a 1.25 reading scale. Above `--text-md` the steps widen, and the
reason is a measurement, not taste.

**The first cut of this scale was a strict 1.25 all the way up, and it produced a product with no
type hierarchy at all.** Walking every text node inside `<main>` on `/contest`: 86 text runs, and
**73 of them were 13px or 16px**. Exactly two runs on the entire screen exceeded 20px. The six
problem titles — the thing a student is on that page to click — rendered at 16px bold, the same
size as the sentence of body copy above them. Across the codebase `--text-xs` was used 158 times
and `--text-sm` 151, against `--text-lg` 16 and `--text-2xl` 4.

A 1.25 ratio at 16px puts the "heading" step at 20px. That is not a step, it is a rounding error,
and the consequence is that nothing on any screen announces itself as more important than anything
else — which is the single loudest reason a page reads as generated rather than designed. 1.25 is
a *reading* ratio; it is right between body and statement body, and wrong the moment a step has to
carry rank.

`--text-xs` stays at 12.8px rather than dropping to 12px. The 0.8px would buy no visible
separation from `--text-sm` — the separation this scale needed was at the top, not the bottom —
and students read this on phones.

Two things that go with the new top of the scale:

- **Pair the top three steps with `leading-tight`.** Call sites set `font-size` from the token as
  an inline style, so a token line-height would not travel with it; at 40px a default 1.5 leading
  is a gap you can park a card in.
- **28px does not need to be bold.** Once a title is at `--text-lg` it is already the largest
  thing in its row, so weight is free again to mean something else.

`tests/a11y/primitives.spec.ts` asserts the **ratios** rather than the values: `--text-lg` at
least 1.4× body, and a real step between each of the top three. Re-tune a number and it stays
green; flatten the scale back and it does not.

**Projector** — base 24px, ratio 1.333 (perfect fourth), deliberately more dramatic:

```css
--proj-sm:  1.50rem;  /* 24px    hard floor — nothing on the projector goes below this */
--proj-md:  2.00rem;  /* 32px    division tabs, column headers */
--proj-lg:  2.67rem;  /* 42.7px  standings rows — the workhorse */
--proj-xl:  3.56rem;  /* 56.9px  leader row, countdown */
--proj-2xl: 4.74rem;  /* 75.9px  champion reveal */
--proj-3xl: 6.32rem;  /* 101px   final score on the awards screen */
```

---

## 5. Layout concept — the ledger and the rail

Two surfaces with opposite jobs, and one device tying them together.

**Competitor and admin surfaces are quiet.** `--paper` ground, `--ink` text, generous
measure (65–75 characters for statements), a single accent. Students are reading and
writing code here for two hours; anything louder becomes noise by minute twenty.

**The projector is monumental.** `--ink` ground, `--paper` text, the crest as a large
low-opacity watermark bleeding off the bottom-left corner, dense typographic hierarchy, no
chrome at all — no nav, no scrollbars, no footer, no login. Everything is either a name, a
number, or the clock.

**The rail** is the device that connects them: a 6px vertical bar on the leading edge of
every standings row and every problem card. On the projector it gives the eye a column to
track straight down the board from the back of the room; in the app it marks division and
status. Its colour is where the rank-change state lives.

Rail states, in order of how loudly they should read:

| State | Rail |
|---|---|
| rank gained | `--rise` |
| rank lost | `--fall` |
| no change | `--paper` at 22% — **neutral, never `--panther`** |

That last row is not a detail. The first specimen used brand red for the resting state, and
on screen it sat in the same warm family as `--fall`: a row that had dropped and a row that
had not moved read alike at a glance, which is exactly what the rail exists to prevent. The
resting state has to recede so the movers can carry the signal.

Grid: 12 columns in the app. The projector is a fixed two-zone split — standings occupying
the left ~72%, clock and division tabs stacked right — sized for 1920×1080, degrading to
1280×720 without reflow, because school projectors are one or the other and neither one
scrolls.

### 5a. Radius — three values, each with a job

```css
--radius-flat:  0px;   /* inputs, table cells, code blocks, the editor surface */
--radius-chip:  3px;   /* buttons, badges, verdict pills, set letters, status dots */
--radius-panel: 8px;   /* cards, panels, dialogs, the outer edge of a standings table */
```

Tailwind emits these as `rounded-flat`, `rounded-chip`, `rounded-panel`.

> **A rectangle that holds DATA has square corners. A small CONTROL has 3px. A rectangle that
> holds a SECTION has 8px.**

Before this there was one radius on everything: **89 of 97 rounded elements were the bare
`rounded`**, 4px, on card and button and input and code block and badge and panel and table
alike. Shape carried exactly zero information.

The rule earns its keep in one specific place: **square cells inside a rounded outer edge.** That
one contrast is most of what separates the data from the panel holding it, and it is what
Codeforces gets for free from its 1px grid and we were getting from nothing.

### 5b. Rules — three weights, each visibly different at 1px

```css
--color-rule-hair: ink 10%;   /* row dividers inside a table */
--color-rule-edge: ink 18%;   /* the outline of a panel, an input, a table */
--color-rule-firm: ink 45%;   /* a deliberate break between unrelated regions; sparse */
```

Declared in the colour namespace, so they exist as `border-rule-hair` / `-edge` / `-firm`. Each
has an inverse-surface twin (`--color-rule-*-inverse`, paper over ink) for the projector and dark
plates.

This replaces **eleven hand-picked alphas over 100 uses** — `border-ink/8, /10, /12, /15, /20,
/25, /30, /35, /40, /45, /50` — chosen per component and, at 1px, visually indistinguishable from
one another. On `/contest`, four distinct border treatments painted at once; on `/team`, 19
elements shared one and a 20th used another. The variety was real in the source and absent on
screen, which is the generated-design signature exactly.

> **A raw `border-ink/N` in a component is a defect, the same way a raw hex is.**

The point is not tidiness. Three *visible* weights let a table's outer edge read differently from
its inner row rules — a distinction the product could not draw at all.

### 5c. Vertical rhythm — three intervals, and only three

```css
--spacing-tight:   0.5rem;  /*  8px  label -> its control, title -> its subtitle, row -> row */
--spacing-group:   1.5rem;  /* 24px  item -> item inside one section */
--spacing-section: 4rem;    /* 64px  section -> unrelated section */
```

Emitted as `gap-tight`, `mt-group`, `py-section`, and every other spacing utility.

`gap-1/2/3/4/5/6/8` and `mt-1/2/3/4/5/6/8` were all in use at comparable frequency — the scale
was being drawn from ad hoc. The measured consequence: on `/admin` the gap between the six cards
(16px) and the gap between that grid and the next section heading (24px) were close enough to read
as the same distance, so **nothing on the page grouped and nothing led.**

The 8× jump from `tight` to `section` is the interval that was missing entirely. HackerRank's
contest form runs roughly 8 / 40 / 64 and that spread is most of why it reads as laid out rather
than emitted.

### 5d. The data table

`components/ui/DataTable.tsx` — `Table`, `THead`, `TBody`, `TR`, `TH`, `TD`, `Stacked`.

Seven files in this codebase contained a `<table>` and each restyled it from scratch;
`<th className="py-2 pr-3 font-semibold">` appeared verbatim in several. That is why the lobby
standings card and the team board looked like different products while showing the same contest
ten seconds apart.

`TeamStandingsBoard` is a careful copy of the Codeforces standings page and is the thing the
primitive was extracted **from**, not a thing to be rewritten by it — its projector sizing and
column-width logic are load-bearing. What the primitive encodes is the grammar measured off the
reference:

- a **vertical hairline between every column**, not only between rows. The single biggest gap
  between the reference and what we had, and no table outside the team board drew one.
- a **tinted header** (`ink/4%`) in small uppercase — a header that is a different *ground*, not
  merely bolder text.
- **44px rows** with a 2% zebra, so the eye tracks across a wide row without a ruler. The stripe
  is always reinforced by a row hairline, never the only channel.
- a **`numeric` cell** that switches to mono tabular figures and right-aligns, per §4.
- a **two-line `Stacked` cell** — the quantity over what qualifies it (score over solve time,
  points over penalty). Codeforces' cell is two lines because the data is; ours could not say it.

**Measured before it was written**, because a table introduces three new grounds and §7's floors
were measured against one:

| ground | full `--ink` | `text-ink/60` | `--panther` |
|---|---|---|---|
| `--paper` | 18.65 | 5.15 | 5.08 |
| + 2% zebra | 17.89 | 5.08 | 4.87 |
| + 8% highlight (the viewer's own row) | 16.59 | 4.95 | **4.52** |
| 9% highlight | 16.34 | 4.92 | **4.45 ✗** |
| zebra **and** 8% highlight together | — | — | **fails** |

Two things fall out of that table and both are in the code:

1. **8% is the ceiling on the highlight**, not a preference — one point further and `--panther`
   misses AA, and a student's own row is exactly where an accent-coloured number turns up.
2. **`TBody`'s zebra selector EXCLUDES the highlighted row** rather than painting under it. Two
   tints composite multiplicatively and the combination fails, on the one row a student is
   guaranteed to look at. The alternative was trusting that no caller ever puts an accent-coloured
   number in their own row, which is not a thing to trust.

And capping the tint at 8% has a consequence worth stating, because it is counter-intuitive: **the
highlighted row then renders LIGHTER than the 2% zebra rows beside it**, so the emphasized row
reads as the quiet one. That is worse than being subtle. `TR` therefore draws the §5 rail on the
highlighted row as an inset shadow — no added width, no collision with the cell borders that make
the grid — and the caller still supplies a `you` label. Three channels, per §3.

Do not deepen the zebra past 3% without re-measuring this table.

The primitive does **not** scroll for you. A wide table sits inside a container that does, and
that container must be `min-w-0` if it is a flex child — which is precisely the bug that made
`/team` drag the whole document sideways at 360px while the board's own `overflow-x-auto` sat
there doing nothing.

### 5e. Controls — a row action is text, a page action is a button

`components/ui/Button.tsx` carries five variants and two sizes:

| Variant | Shape | Use |
|---|---|---|
| `primary` | filled `--panther` | the ONE thing a screen exists to do |
| `secondary` | `--rule-edge` outline | the alternative to it |
| `ghost` | no border, muted ink | dismiss, cancel, close |
| `danger` | `--panther` outline | destructive and audit-logged: override, rejudge |
| `quiet` | text, underline on hover | anything that lives inside a table row |

| Size | Padding | Type |
|---|---|---|
| `sm` | 10/4 | row and toolbar actions |
| `md` | 16/8 | a page's own actions |

Every button in the product used to be `px-4 py-2` at body size, which meant a row action and a
page action were the same object. `/admin/console` rendered a full-size `Rejudge` and a
red-outlined `Override` on each of **fourteen** rows: twenty-eight controls all shouting at once,
with nothing to say which one the organizer came for. Both references solve this the same way — an
in-row action is text, and only the page's one primary action is a filled button.

`quiet` sits at `text-ink/60`, the documented §7 floor (5.15:1), and darkens to full ink on hover
rather than changing hue: the affordance is weight and an underline, never colour alone. It keeps
a 32px minimum height, because a text button on a phone still has to be hittable.

**Weight lives on the variant, never in `Button`'s shared base string.** Two `font-*` utilities on
one element are resolved by the order Tailwind emits them, not by the order they appear in the
class list, so a base `font-semibold` that a variant tries to override is a coin flip.

---

## 6. Signature element — the Unfreeze

The one thing the night is remembered by. PRD §6.3 already makes the board stop updating
after `freezeAt` while judging continues; this is what that pause is *for*.

**During the freeze.** The standings desaturate to greyscale — except each row's rail, which
stays live. A `--gold` plate sits above the board reading `BOARD FROZEN`, and the crest
watermark drops to its outline variant. The board is visibly holding its breath: everyone
can see that positions are still moving underneath and that they cannot see them.

**The unfreeze.** One admin action, then in sequence:

1. The gold plate lifts away.
2. Rows animate from frozen position to final position — spring, 40 ms stagger down the
   board, so the reveal cascades rather than snapping.
3. Each row that moved flashes its rail `--rise` or `--fall` and its delta glyph counts up
   from `−` to the final `↑n` / `↓n`.
4. The board settles. The champion's row grows to `--proj-2xl`, and **the crest ignites** —
   the outline mark fills to full colour, gold ring first, then the field. It is the only
   moment all night that the crest appears in full colour at full opacity.

**Under `prefers-reduced-motion`,** every step still happens and nothing is lost: the
greyscale lifts, rows reorder with a cross-fade instead of travel, deltas appear at their
final value, and the crest fills without the ring flourish. The information is identical;
only the theatre is removed.

---

## 7. Quality floor

Not optional, and G9 checks the parts that can be automated:

- WCAG AA contrast everywhere, using §2's measured table — not eyeballed.

### Muted text has a floor. Both directions. Measured.

§2's table covers the six tokens at full strength. It said nothing about *muted* text, and
four separate surfaces independently chose an opacity that fails AA — join, the lobby, the
verdict panel, and the editor. The gap was in this document, not in anyone's judgement, so
the floors are stated here:

| Muted text | Minimum | Use | Fails below |
|---|---|---|---|
| `text-ink/N` on `--paper` | **57%** — use `/60` | competitor + admin surfaces | `/55` = 4.34:1, `/50` = 3.65:1, `/40` ≈ 3:1 |
| `text-paper/N` on `--ink` | **47%** — use `/55` | projector, verdict panel, code surface | `/45` = 4.29:1, `/40` = 3.62:1 |

Two rules that go with them:

- **Never dim a container with `opacity-*` to mute the text inside it.** Wrapper opacity
  *multiplies* with any alpha on the children: `opacity-60` over `text-ink/70` composites to
  0.42 and measures 2.84:1. A locked problem row rendered that way is unreadable. Convey the
  state with a label and the rail — both of which a screen reader gets anyway — and leave the
  text at full strength.
- **A disabled control is a different KIND of object, not a faded live one.** The old rule here
  said `disabled:opacity-*` was fine and exempt — axe does not check contrast on disabled
  controls, which is true — and it was read as licence to blanket a solid `--panther` fill in
  `opacity-50`. On `/sign-in` that painted a washed-pink Sign in button: still obviously a button,
  still obviously the primary one, giving no signal at all that it was off. It read as *enabled
  and somehow broken*. Exempt from the contrast floor was never exempt from being legible. So
  `Button` gives disabled its own skin — no fill, no border, `text-ink/40` — and the general rule
  is: **remove the affordance, do not fade it.** `tests/a11y/primitives.spec.ts` asserts a
  disabled primary carries no accent fill and no wrapper opacity.
- Visible keyboard focus on every interactive element: 2px `--panther` ring with a 2px
  offset, never `outline: none`.
- The entire submit flow completes keyboard-only.
- `prefers-reduced-motion` respected by every animation, per §6.
- Competitor surfaces responsive to 360px. Students are on phones.
- Rank change communicated by glyph + position + colour, never colour alone (§3).

---

## 8. The crest

`public/brand/pt-crest-color.svg` and `pt-crest-outline.svg`, taken from the school theme
and self-hosted. Verified to contain no external references — the only `http` string is the
SVG XML namespace — so it renders with the network unplugged.

It is the school's mark, not a decorative asset. Do not recolour it, stretch it, rotate it,
crop it, or rebuild it from paths. Full colour is reserved for the champion reveal in §6;
everywhere else it appears as the outline variant or as a watermark at low opacity.

---

## 9. Review — what was rejected, and why

KICKOFF asks that this plan be reviewed against the brief and anything that reads like a
default rather than a choice be revised. What that pass removed:

- **Geist Sans / Geist Mono**, which `create-next-app` had already wired in. They are the
  framework's default and were fetched from Google at build time. Removed in Phase 1.
- **Green-for-up, red-for-down.** The obvious choice, wrong twice here: red is the school's
  identity colour, and red-green is the one pair colour-blind viewers cannot separate.
- **A single type scale.** Convenient, and it produces a projector view that looks like a
  browser zoomed to 200%.
- **A strict 1.25 ratio all the way up the app scale.** Rejected on a measurement, after it
  shipped: 73 of the 86 text runs on `/contest` rendered at one of two sizes, and the six problem
  titles came out the same size as the body copy above them. See §4 — 1.25 is a reading ratio and
  it cannot also carry rank.
- **One 4px corner on everything.** 89 of 97 rounded elements were the bare `rounded`, so shape
  said nothing about what a thing was. Replaced by the three-value rule in §5a.
- **Per-component border alphas.** Eleven values over 100 uses, indistinguishable at 1px:
  variety that existed only in the source. Replaced by the three rules in §5b.
- **`disabled:opacity-*` on a filled control.** Faded the primary action into something that read
  as broken rather than off. See §7.
- **Baskerville numerals on the leaderboard.** Prettier, and they jitter every time a score
  updates — which is exactly when everyone is looking.
- **Pure `#FFFFFF`.** Clinical against a warm near-black. Warmed to `--paper`.
- **A second red token.** `#95271A` is the school's secondary, but two reds with no stated
  rule between them means four agents pick differently. It stays a derived shade.
