# Math Coloring Book Generator

`MathColoringBookGenerator.jsx` creates color-by-math pages in Adobe Illustrator.

The current workflow is designed so you do **not** manually enter page colors anymore.

The script now:

- reads the unique RGB fill colors from the selected artwork
- builds the answer list from the chosen preset
- automatically maps page colors to answers
- places the math operation inside each shape
- creates a legend with filled color squares and answers inside them

## Main Idea

You only change:

- `CONFIG.presetName`
- `CONFIG.fixedFactor` for fixed multiplication pages
- `CONFIG.fixedDivisor` for fixed division pages
- `CONFIG.customAnswers` for random or mixed pages

You do **not** need to hardcode `colorToAnswer` maps for every page.

## Available Presets

These are the preset names you can use:

- `fixedMultiplication`
- `fixedDivision`
- `randomMultiplication`
- `randomDivision`
- `mixedRandom`

## Quick Start

1. Open your Illustrator document.
2. Select the colored shapes for one page.
3. Open [MathColoringBookGenerator.jsx](./MathColoringBookGenerator.jsx).
4. Set `CONFIG.presetName`.
5. If needed, set `CONFIG.fixedFactor`, `CONFIG.fixedDivisor`, or `CONFIG.customAnswers`.
6. Run the script in Illustrator.
7. Read the summary dialog at the end.

## How Each Preset Works

### `fixedMultiplication`

Use this for pages like the `x2`, `x3`, `x4` ... `x10` table.

Change only:

```js
fixedFactor: 9
```

The script automatically generates these 10 answers:

```js
9, 18, 27, 36, 45, 54, 63, 72, 81, 90
```

Then it automatically maps the page's 10 colors to those answers.

### `fixedDivision`

Use this for pages like division by `2`, `3`, `4` ... `10`.

Change only:

```js
fixedDivisor: 10
```

The script automatically generates these 10 answers:

```js
1, 2, 3, 4, 5, 6, 7, 8, 9, 10
```

Then it creates division operations such as:

```txt
90 / 10
40 / 10
10 / 10
```

### `randomMultiplication`

Use this when you want custom answer numbers and multiplication-only operations.

Change only:

```js
customAnswers: [70, 63, 56, 49, 42, 35, 28, 21, 14, 7]
```

For each answer, the script finds a valid multiplication expression automatically.

### `randomDivision`

Use this when you want custom answer numbers and division-only operations.

Change only:

```js
customAnswers: [70, 63, 56, 49, 42, 35, 28, 21, 14, 7]
```

For each answer, the script builds a matching division such as:

```txt
140 / 2
280 / 4
630 / 9
```

### `mixedRandom`

Use this when you want custom answer numbers and the script may choose either multiplication or division.

Example:

```js
customAnswers: [45, 40, 36, 32, 28, 24, 21, 18, 14, 10]
```

For `45`, possible operations include examples like:

- `5 x 9`
- `9 x 5`
- `3 x 15`
- `15 x 3`
- `90 / 2`

The script picks one valid operation at random.

## Automatic Color Mapping

The page colors are assigned automatically.

Current rule:

- colors are grouped in rainbow-like hue families
- within each hue family, colors are ordered from darkest to lightest
- answers are sorted from largest to smallest
- then they are paired together

So the legend and auto-mapping now read more like grouped reds, yellows, greens, blues, and so on, instead of only following brightness.

## Legend

When `legend.enabled` is `true`, the script creates a color key layer with filled squares.

Each square:

- uses one of the page colors
- shows the matching answer inside the square
- uses black or white text automatically for contrast

## Important Rule About Color Count

By default:

```js
requireExactColorCount: true
```

That means:

- if the page has 10 unique RGB fill colors, the preset must produce 10 answers
- if the counts do not match, the script stops and shows an alert

This is intentional, because automatic pairing is only safe when the number of colors and answers matches.

## Recommended Workflow

### Fixed multiplication pages

1. Set `presetName: "fixedMultiplication"`.
2. Change `fixedFactor`.
3. Select the page artwork.
4. Run the script.

### Fixed division pages

1. Set `presetName: "fixedDivision"`.
2. Change `fixedDivisor`.
3. Select the page artwork.
4. Run the script.

### Random or mixed pages

1. Set `presetName` to `randomMultiplication`, `randomDivision`, or `mixedRandom`.
2. Set `customAnswers` to the exact answer list for that page.
3. Make sure the page has the same number of unique RGB colors as answers.
4. Select the page artwork.
5. Run the script.

## Text Placement

The script no longer uses the original shape as an Illustrator area-text container.

Instead it:

1. reads the polygon points of the shape
2. searches for the best inner rectangle candidate
3. checks whether the real text box stays inside the polygon
4. optionally rotates the text with that rectangle
5. starts from `defaultTextSize`
6. keeps the operation horizontal if it already fits at full size that way
7. shrinks only if needed
8. centers the final operation in the detected inner box

This works much better for triangle-based artwork.

## Most Important Config Options

These are near the top of [MathColoringBookGenerator.jsx](./MathColoringBookGenerator.jsx).

- `presetName`
- `fixedFactor`
- `fixedDivisor`
- `customAnswers`
- `requireExactColorCount`
- `defaultTextSize`
- `minTextSize`
- `emergencyMinTextSize`
- `rotateTextWithShape`
- `textBoxPaddingRatio`
- `textHeightPaddingRatio`
- `innerBoxSamples`
- `legend.enabled`
- `answerKey.enabled`

## Troubleshooting

### "Brak otwartych dokumentow."

No Illustrator document is open.

### "Najpierw zaznacz obiekty."

Nothing is selected.

### "Brak PathItem w zaznaczeniu."

The selection does not contain supported path objects.

### "Brak obiektow z wypelnieniem RGB w zaznaczeniu."

The selected objects do not have RGB fills.

### "Liczba unikalnych kolorow (...) nie zgadza sie z liczba odpowiedzi (...)."

The page has a different number of unique colors than the current preset produced answers.

Fix one of these:

- reduce the number of unique page colors
- change `customAnswers`
- switch to the correct preset
- turn off strict matching if you really want partial pairing

### "Pominiete (bez RGB fill)"

Some selected shapes use non-RGB fills and were skipped.

## Known Limitations

- Only RGB fills are supported.
- Exact color matching is still required.
- The automatic color pairing is deterministic, but it is based on brightness, not a semantic palette order.
- The inner-box text placement works best on polygon-style shapes and may still need visual review on highly irregular or curved art.
- Mixed pages still require you to choose the answer list manually.

## Notes

`getHexCode.jsx` is no longer required for the main workflow.

It can still be useful if you want to inspect page colors for debugging.
