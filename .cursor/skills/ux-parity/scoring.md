# Scoring

`tools/ux-parity/src/score.js` is the source of truth. This file describes the same rules.

Both pages run in one headless Chromium with `locale` `en-US`, `timezoneId` `UTC`, `deviceScaleFactor` 1, `colorScheme` light, and `reducedMotion` reduce. The same viewport is set on both sides before a state is captured. The tool waits for `document.fonts.ready` and 250ms so short transitions settle. It does not inject stylesheet changes into either app.

## Per state

Elements compared: `html`, `body`, `app-root`, any element with an id, and structural or interactive elements (links, buttons, inputs, selects, textareas, labels, headings, forms, tables, headers, sections, images, summaries, roles). Hidden nodes (`display: none`, `visibility: hidden`, or no box) are compared only for visibility.

Alignment order:

1. Same `id`
2. Unique accessible role plus accessible name
3. Same structural selector

For each visible pair, every property in `STYLE_PROPS` is compared after whitespace normalization. Border color and style are ignored when that side's width is `0px` on both pages. Outline color and style are ignored when outline width is `0px` on both. A difference that remains is one mismatch. A reference element with no partner counts as a full property-set mismatch (`exists`). An extra target element counts as five mismatches.

Layout match: a pair matches when `x`, `y`, `width`, and `height` are each within `layoutTolerance` pixels (default 2).

Pixel match: viewport screenshots, `pixelmatch` threshold `0.1`, antialiasing excluded. Area that exists on only one image counts as mismatched. `ignore.selectors` are painted black on both shots before the compare.

```
visual = 1 - clamp(pixelMismatchRatio, 0, 1)
stateLook = 0.50 * visual + 0.35 * styleMatchRatio + 0.15 * layoutMatchRatio
lookScore = mean(stateLook) over states that were not skipped
```

Class name differences are `classHints`. They do not change the score. Text differences are `contentDiffs`. They do not change the score unless the manifest expectation lists that text, or the text changes layout or pixels.

Skipped states (mutation blocked on the reference, or `maxStates`) stay out of the look average and are listed by id.

## Gates

`behaviorPass` is false when any manifest `expect` fails. A failure on the reference means the flow is wrong. A failure on the target means the localhost app did not do what the reference did.

`controlsPass` is false when a crawled control is missing on one side, or `disabled`, `required`, or `type` differs.

`matched` requires `lookScore`, `pixelMismatchRatio`, `styleMatchRatio`, `layoutMatchRatio`, `behaviorPass`, and `controlsPass` against `thresholds`.

## Clusters

Mismatches group by computed property plus reference value. The largest existence or visibility cluster is first; otherwise the largest count is first. One iteration fixes the first cluster, then the CLI runs again.

## Plateau

`history.jsonl` appends one summary per run. A gain in `lookScore` smaller than `thresholds.plateauDelta` (default 0.005) is a plateau. Stop and report the remaining clusters.

## Guard

`ux-parity guard` fails when a changed file under `sourceRoot` has a source extension and does not match `editAllowlist`. Cache, `node_modules`, `dist`, and `.angular` are ignored. Files outside `sourceRoot` are ignored.
