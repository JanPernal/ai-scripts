# Math Coloring Book Generator

`MathColoringBookGenerator.jsx` creates color-by-math pages in Adobe Illustrator.

The script now shows a dialog every time you run it, so you no longer need to
edit any config values in the file before running the script.

The script:

- reads the unique RGB fill colors from the selected artwork
- shows them (with a swatch, hex code and shape count) in a scrollable table
- lets you pick a mode (Fixed table, Random, Fractions) and per-mode settings
- auto-fills an answer for every color, which you can review or edit
- can also recommend a "divisor-rich" set of answers, tuned to the current
  mode, instead of the plain auto-fill sequence
- places the math operation inside each shape
- creates a legend with filled color squares and answers inside them, listing
  every mapped color even if some of its shapes ended up on the preprint
  layer
- remembers your last settings for next time (and lets you save/load presets)
- the dialog window is resizable and its color list scrolls/grows with it

## Quick Start

1. Open your Illustrator document.
2. Select the colored shapes for one page.
3. Run [MathColoringBookGenerator.jsx](./MathColoringBookGenerator.jsx).
4. In the dialog, choose a **Mode** (Fixed table / Random / Fractions) and
   adjust its settings on the left.
5. Review the auto-filled answers in the **Colors in selection** table on the
   right. Edit any answer you want to change (accepts `45`, `3/4`, or
   `1 1/2`).
6. Click **Generate**.
7. Read the summary alert at the end.

Any number of unique colors is supported — the table grows/scrolls to fit.

## The Dialog

### Mode panel (left)

Choose one of three modes from the dropdown. Only the matching sub-panel is
shown.

**Fixed table**

- `Multiplication` or `Division`.
- Multiplication: set `Factor` (e.g. `9` for a "x9" table), plus `Min factor`
  / `Max factor` bounds used when the script looks for alternate factor
  pairs, and whether the fixed factor should be written first
  (`Put the fixed factor first`).
- Division: set `Divisor` and, optionally, `Max dividend` (leave blank to
  auto-compute it as `divisor x number of colors`).

**Random**

- `Multiplication`, `Division`, or `Mixed` (the script picks multiplication
  or division per shape).
- `Min factor` / `Max factor` and `Min divisor` / `Max divisor` bound the
  operand ranges; `Max dividend` bounds division results.
- `Randomize operand order` swaps the two operands roughly half the time.

**Fractions**

- Operation: `Addition`, `Subtraction`, `Multiplication`, or `Division`.
- Answer type:
  - `Fractions` — the legend shows e.g. `3/4`.
  - `Integers` — the legend shows a whole number, e.g. `6`, and the
    generated expression mixes a fraction with a whole number
    (e.g. `3/4 x 8 = 6`).
- `Max denominator` bounds every fraction used (both answers and operands).
- `Max whole multiplier` bounds the whole-number operand when Answer type is
  `Integers`.
- `Require simplified result` forces operands whose raw (unreduced) result
  is not already in lowest terms, so the answer requires simplification
  (e.g. `2/8 + 2/8 = 1/2`). When off, the script prefers operands that
  already land on the answer without any reduction (e.g. `1/4 + 2/4 = 3/4`).
- `Same denominators only` (Addition/Subtraction only) forces both operands
  to share a denominator as written.
- `Allow improper fractions` permits operands and answers of 1 or greater
  (up to a value of 3).

### Output panel (left)

- `Text size` / `Min text size` — starting and minimum point size for the
  fitted text.
- `Rotate text with shape` — allow the operation to follow the best-fitting
  angled inner box.
- `Auto text contrast` — automatically switch text color to black or white
  for readability against the fill color.
- `Create legend` / `Legend columns` — toggle the color-key legend and set
  how many columns it wraps at.
- `Create answer key layer` — adds a hidden layer with the full
  `expression = answer` text over each shape, useful for checking your own
  work.
- `Random seed` — leave blank for normal randomness, or enter a number for
  reproducible output.
- `Math text layer` — name of the layer the generated math text frames are
  placed on. If the layer doesn't exist yet, the script creates it; if it's
  locked or hidden, the script automatically unlocks and shows it before
  generating.

### Colors in selection panel (right)

One row per unique color found in the selection, sorted in the same
rainbow-family order used for the legend:

`[swatch]  #RRGGBB   (N shapes)   [answer field]`

- `Auto-fill answers` regenerates every answer from the current mode
  settings.
- `Recommend answers` fills every answer field with a randomized,
  "divisor-rich" set of values appropriate to the current mode (see
  [Recommend Answers](#recommend-answers) below). Fields stay freely
  editable afterward, exactly like auto-fill.
- `Clear answers` empties every field.
- Editing any answer field by hand disables auto-fill for that field until
  you click `Auto-fill answers` again or change the Mode dropdown (mode
  changes always re-run auto-fill for every row).

**Recommended range**

Two fields, `Recommended range min` / `Recommended range max`, sit under the
list buttons. They bound the pool of candidate values `Recommend answers`
draws from:

- In `Random` mode (Multiplication, Division, or Mixed) and in `Fractions`
  mode with `Answer type = Fractions`, the fields auto-populate from the
  range of values your current mode settings can actually produce, and act
  as an *additional* clamp on top of that derived range.
- In `Fractions` mode with `Answer type = Integers`, no range can be derived
  from the settings, so the fields are the *only* source of the range and
  default to `1` / `100`.
- In `Fixed table` mode, the answers are fully determined by the fixed
  factor/divisor, so there is nothing to recommend: both the range fields
  and the `Recommend answers` button are disabled (with a tooltip explaining
  why).

The fields recompute automatically whenever the mode or a relevant mode
setting changes, unless you've edited them by hand, in which case your value
is kept until `Reset defaults` / `Load preset` establishes a new baseline.

### Bottom row

- `Save preset` / `Load preset` — save or load the entire dialog state
  (mode, all settings, and the current answers) as a `.json` file.
- `Reset defaults` — restores the script's built-in defaults and re-runs
  auto-fill.
- `Cancel` — closes the dialog without changing the document.
- `Generate` — validates every answer, then builds the page.

## Answer Input Formats

Any answer field accepts:

- a whole number: `45`
- a simple fraction: `3/4`
- a mixed number: `1 1/2` (interpreted as `3/2`)

Whole-number modes (`Fixed table`, `Random`, and `Fractions` with
`Answer type = Integers`) require every answer to be a whole number. If any
answer is a fraction in one of these modes, `Generate` shows an alert and
keeps the dialog open so you can fix it.

## Recommend Answers

`Recommend answers` (in the **Colors in selection** panel) replaces every
answer with a randomized set of values chosen to have "as many divisors as
possible" for the current mode — i.e. values that can be reached the most
different ways under your settings, which tends to make richer, more varied
generated expressions:

- **Random / Multiplication**: candidates are every distinct product `a*b`
  for `Min factor <= a,b <= Max factor`; a candidate's score is how many
  ordered `(a,b)` pairs produce it.
- **Random / Division**: candidates are every distinct quotient `q` such
  that `q*d <= Max dividend` for some `Min divisor <= d <= Max divisor`; a
  candidate's score is how many valid `(dividend, divisor)` pairs produce
  it.
- **Random / Mixed**: the union of both candidate sets above, with the two
  scores summed for any value reachable both ways.
- **Fractions / Answer type = Fractions**: candidates are every fraction in
  lowest terms with denominator `2..Max denominator` (plus improper
  fractions up to `3` if `Allow improper fractions` is on); a candidate's
  score is how many denominators up to `Max denominator` it can be
  re-expressed with as a whole-number-scaled fraction.
- **Fixed table** (either operation): not applicable — the answers are
  fully determined by the fixed factor/divisor, so `Recommend answers` and
  the range fields are disabled.
- **Fractions / Answer type = Integers**: no range can be derived from the
  settings, so the manual `Recommended range` fields (default `1`-`100`)
  are the only source of candidates.

The highest-scoring ~30% of candidates (never fewer than twice the number of
colors, never more than the full candidate list) form a pool. The script
then randomly samples one distinct value per color from that pool — using
the `Random seed` field for reproducibility, just like the rest of the
script — sorts the chosen values from largest to smallest, and assigns them
to the color rows in the same order `Auto-fill answers` uses. If the pool
doesn't have enough distinct values for every color, the remaining rows are
silently filled in using `Auto-fill answers`' regular sequence.

## Worked Examples — Fractions Mode

**Addition, Answer type = Fractions, Same denominators only = on**

Answer `3/4` -> expression `1/4 + 2/4`.

**Addition, Require simplified result = on**

Answer `1/2` -> expression `2/8 + 2/8` (the raw sum `4/8` must simplify down
to `1/2`).

**Subtraction, Same denominators only = on**

Answer `1/3` -> expression `2/3 - 1/3`.

**Multiplication, Answer type = Fractions**

Answer `1/4` -> an expression such as `1/2 x 1/2`.

**Division, Answer type = Fractions**

Answer `2/3` -> an expression such as `4/9 ÷ 2/3`.

**Multiplication, Answer type = Integers**

Answer `6` -> an expression such as `3/4 x 8`.

**Division, Answer type = Integers**

Answer `4` -> an expression such as `2 ÷ 1/2` (a whole number divided by a
fraction, since `2 ÷ (1/2) = 4`) or `2/3 ÷ 1/6` (a fraction divided by a
fraction), whichever the script finds first within the configured
denominator limits.

## Legend

When `Create legend` is on, the script creates (or reuses) a "Math Legend"
layer with one filled square per color and the answer's display text
(e.g. `3/4`, `1 1/2`, or `6`) centered inside it, sorted from the largest
value to the smallest.

The legend always lists **every color that has a valid mapped answer**, not
just the colors that received placed text. Some shapes are too small to fit
the math text and are duplicated onto the "Preprint shapes" layer instead
(left blank so you can fill them in by hand); those shapes' colors still
appear in the legend/color key, since the color mapping is still meaningful
even though the shape didn't get text.

## Dialog Window

The dialog window is resizable (drag any edge/corner) and remembers a
minimum usable size (roughly 700x520). The **Colors in selection** list
grows and shrinks its scrollable viewport along with the window instead of
staying a fixed height.

## Persistence

The dialog remembers your last-used settings (mode, all per-mode fields,
output options, and the answer typed for each hex color) in
`MathColoringBookGenerator.settings.json`, saved next to the script. This
file is written automatically whenever you click `Generate`. If the folder
is read-only, the script silently skips saving and continues to work
normally.

Use `Save preset` / `Load preset` to store named presets separately (for
example, one preset per book or grade level).

## Text Placement

The script does not use the shape as an Illustrator area-text container.
Instead it:

1. reads the polygon points of the shape
2. searches for the best inner rectangle candidate
3. checks whether the real text box stays inside the polygon
4. optionally rotates the text with that rectangle
5. starts from `Text size`
6. keeps the operation horizontal if it already fits at full size that way
7. shrinks only if needed, down to `Min text size`
8. centers the final operation in the detected inner box

This works well for triangle-based and other irregular artwork.

## Troubleshooting

### "No open document."

No Illustrator document is open.

### "Please select objects first."

Nothing is selected.

### "No PathItem found in the selection."

The selection does not contain supported path objects.

### "No objects with an RGB fill found in the selection."

The selected objects do not have RGB fills (or are all hidden/locked).

### "Some answers are invalid: ..."

One or more rows contain text that can't be parsed as a number, fraction,
or mixed number, or contains a zero/negative denominator. Fix the listed
hex codes and click `Generate` again.

### "This mode requires whole-number answers, but the following colors have a fraction answer: ..."

You are using `Fixed table`, `Random`, or `Fractions` with
`Answer type = Integers`, but one or more answer fields contain a fraction.
Either change the answer to a whole number or switch modes.

### "Target layer cannot be modified"

This means the document's active layer was locked, hidden, or a template
layer when the script tried to create math text on it. The script now
automatically finds or creates an unlocked, visible layer named "Math
Operations" (or the name you set in `Math text layer`) and targets that
layer before generating, so this should no longer occur. If you still see
it, unlock all layers in the Layers panel and run the script again, or
change the `Math text layer` name in the dialog to a layer you know is
writable.

### Some shapes have no math text

An answer could not be expressed under the current mode settings — for
example, with `Allow improper fractions` off and `Max denominator` 12,
no pair of proper fractions can add, subtract, multiply, or divide to
`7/8`. The script now checks feasibility before generating and, if it
finds answers like this, shows a warning listing them (with the affected
colors and shape counts) before you commit to generating. If you click
`Continue anyway`, those shapes are left without math text, same as
before.

To fix it, try raising `Max denominator`, turning on `Allow improper
fractions`, widening the factor/divisor range (for `Fixed table` or
`Random` modes), or choosing a different answer for that color.

## Live Paint Support

If your selection contains a Live Paint group, the script detects it
automatically (before it looks for any colored shapes) and asks for
confirmation before doing anything to your artwork:

- The script scans the selection for Live Paint groups and, if it finds any,
  shows a confirmation dialog before touching the document.
- Expansion is **permanent** — once you confirm, the Live Paint group's
  editability is lost.
- After expanding, the script keeps the fill shapes and applies the outline
  stroke (color and weight) to them, then deletes the separate stroke group.
- **Caveat:** outlines around unfilled/unpainted regions are removed. If your
  Live Paint artwork relies on those outlines being visible, expanding will
  lose them.
- If you decline the confirmation, the script stops immediately and the
  document is left unchanged.

If you want to keep an editable Live Paint original, duplicate the artwork
(or the layer) before running the script, and run the script on the
duplicate.

## Known Limitations

- Only RGB fills are supported.
- The automatic rainbow color ordering is deterministic but based on hue
  family, lightness and saturation, not a semantic palette order.
- The inner-box text placement works best on polygon-style shapes and may
  still need visual review on highly irregular or curved art.
- Fraction expression search is bounded (candidates are capped at 400 and
  denominators/numerators are capped by `Max denominator`); very
  restrictive combinations of settings (e.g. a very small `Max denominator`
  together with `Require simplified result`) may fail to find a valid
  expression for some answers, in which case that shape is skipped and
  reported in the summary as "Skipped (no valid expression)".

## Notes

`getHexCode.jsx` is no longer required for the main workflow. It can still
be useful if you want to inspect page colors for debugging.
