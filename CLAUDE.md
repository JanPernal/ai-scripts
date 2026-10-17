# CLAUDE.md — ai-scripts

Adobe Illustrator ExtendScript (.jsx) tools for Jan's color-by-math KDP coloring books.

## Project context
- Scripts run in Illustrator 2026 via File → Scripts → Other Script… (⌘F12). ES3 JavaScript (no `let`, arrow functions, `JSON` is not guaranteed).
- Main document: `Art_Operations_Claude.aic` — 27 artboards (3 rows × 9). Row 1 = fractions, row 2 = multiplication, row 3 = division.
- Layers: `Math Legend` (per-artboard `MathLegend_Auto` group: colored squares + answers; fractions are groups of numerator/bar/denominator), `layout` (one group per artboard: header, top mini swatches, bottom swatch row, answers), `Math Operations`, `Math Answer Key`, plus content/background/guides layers.
- Rule: a script edits only the layers it is responsible for; never group items across layers.

## Scripts
- `MathColoringBookGenerator.jsx` — generates operations, legend and answer key from selected colored artwork (see README).
- `ApplyLegendToLayout.jsx` — copies colors + answers from `Math Legend` into `layout` per artboard (sorted ascending, equal gaps, Live Paint, header, regroup).

## Testing
- Test on the backup document directly. A quick way to verify structure is a small dump script that writes a text file next to itself, then read that file.
- Scratch files go in `_claude_tmp/` (git-ignored).

## Working with subagents
Delegate when it saves tokens or parallelizes work; do it yourself when that is faster or needs judgment/context you already have.
- `implementer` (sonnet) — well-specified code edits, refactors, boilerplate.
- `researcher` (sonnet) — Illustrator scripting API lookups, docs, external facts.
Give each a self-contained brief and review what comes back. These are defaults, not limits — use your own judgment.
