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

**App** — base 16px, ratio 1.25 (major third):

```css
--text-xs:  0.80rem;  /* 12.8px  metadata, timestamps */
--text-sm:  1.00rem;  /* 16px    body, form labels */
--text-md:  1.25rem;  /* 20px    problem statement body */
--text-lg:  1.56rem;  /* 25px    problem title */
--text-xl:  1.95rem;  /* 31px    page heading */
--text-2xl: 2.44rem;  /* 39px    contest name */
```

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
- **Baskerville numerals on the leaderboard.** Prettier, and they jitter every time a score
  updates — which is exactly when everyone is looking.
- **Pure `#FFFFFF`.** Clinical against a warm near-black. Warmed to `--paper`.
- **A second red token.** `#95271A` is the school's secondary, but two reds with no stated
  rule between them means four agents pick differently. It stays a derived shade.
