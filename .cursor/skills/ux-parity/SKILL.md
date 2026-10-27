---
name: ux-parity
description: >-
  Compares a reference UI (usually a traversable production site) with a
  localhost target across viewports, scripted flows, and every reachable
  control, then iteratively fixes only the target's presentation until the
  measured look score matches and behavior checks pass. Use when matching two
  UIs, closing UX or visual drift against production, fixing look and feel,
  or running ux-parity. The score comes from tools/ux-parity, not from a
  visual impression.
---

# UX parity

Make the localhost target look like the reference and keep every checked behavior working. The reference is read-only unless its manifest sets `allowMutations`. One manifest describes one app. The same skill and CLI cover any web UI; this repo's student form is only the fixture.

Read [manifest.md](manifest.md) before writing a manifest. Read [scoring.md](scoring.md) before interpreting a score.

## Loop

Copy this checklist and update it every iteration:

```
UX parity:
- [ ] Manifest loaded (reference URL, target URL, sourceRoot, flows, viewports)
- [ ] Both URLs open in a browser
- [ ] ux-parity run completed and report.json read
- [ ] Behavior failures classified (presentation vs blocked logic)
- [ ] One presentation cluster fixed under the edit allowlist
- [ ] Re-measured
- [ ] Stop rule applied (matched, plateau, or maxIterations)
- [ ] guard passed
```

From the repository root:

```bash
node tools/ux-parity/src/cli.js run --manifest ux-parity.manifest.json --out ux-parity-out
node tools/ux-parity/src/cli.js guard --manifest ux-parity.manifest.json
```

Exit `0` means `matched: true`. Exit `2` means a measured mismatch remains. Exit `1` means the run crashed; fix the cause and leave the target unchanged.

The judge is `report.json` plus `history.jsonl`. Screenshots explain a cluster. They never override the score.

## What a match is

`matched: true` only when all of these hold:

- `lookScore` is at least the manifest threshold (default 0.98)
- mean pixel mismatch is at or below the threshold (default 0.015)
- mean computed-style match and layout match meet their thresholds
- every manifest expectation passed on the reference and the target
- every crawled control matched (exists, disabled, required, type)

That measured bar is the operational 100%. Identical PNG bytes are not the bar: the same Chromium still antialiases. Do not lower thresholds to pass.

## Edit boundary

Change files under `target.sourceRoot` that match `editAllowlist`.

Allowed: stylesheets, class and style attributes, presentational wrapper markup, font files, and images that exist in the reference.

When behavior fails, fix it only if presentation causes it (element not visible, covered, or not hittable). When the failure is data, validation, routing, or component logic, append `ux-parity-out/blocked.json` and continue with presentation clusters:

```json
{
  "items": [
    {
      "id": "register-submit",
      "reason": "Target submit handler never appends a row. CSS cannot fix this.",
      "evidence": "behavior desktop/register/submit"
    }
  ]
}
```

Leave the reference application and the production site unchanged. Production mutations run only when `reference.allowMutations` is true and the account is disposable. Credentials stay in environment variables (`${ENV:NAME}`) or a gitignored Playwright `storageState` file.

## How to fix one iteration

1. Read `summary`, `behavior`, `controls`, and `clusters` in `ux-parity-out/report.json`.
2. If a reference expectation failed, fix the manifest flow so it describes the reference. Do not edit the target to satisfy a bad script.
3. Pick the first cluster. It lists the computed property, the reference value, the target values, and selectors.
4. Use `classHints` only to find the stylesheet rule. The computed value is what must match.
5. Change the smallest presentation surface that corrects that cluster. When the same inherited property is listed on a parent and its descendants, set it on the ancestor. Prefer the target's own selectors. Copy a reference rule only when the same selector exists on both and the cluster is a computed-style gap.
6. Re-run the CLI. Compare the new `history.jsonl` line with the previous one.

## Stop

Stop editing when any of these is true:

- `matched` is true and `guard` passed
- the last iteration raised `lookScore` by less than `thresholds.plateauDelta` (default 0.005) and the remaining clusters are recorded
- iterations reached `thresholds.maxIterations`
- the remaining failures are listed in `blocked.json`

A plateau with open presentation clusters is an incomplete match. Say that, and list the clusters. Do not describe it as 100%.

## Depth

The manifest flows are the deep paths (validation, filled form, submit, delete, and any route a crawler cannot safely click). The crawl then probes every visible control on those states and captures hover and focus, on every listed viewport, until `limits.maxCrawlActions` or `limits.maxStates`.

Add a flow when the report shows a control that changes the page and no flow covers it. Keep destructive clicks out of the crawl. Put them in a flow with `"mutates": true`. On a production reference, leave `allowMutations` false so those steps run as behavior checks on localhost only.

## Fleet

Each of the 3000 apps gets its own manifest and its own `ux-parity-out`. The CLI is unchanged. A scheduler can run `ux-parity run` per manifest. This skill does not hardcode a framework, a route list, or the student-registration fixture.

## Fixture in this repo

Reference: `http://localhost:4200` (`app-a`). Target: `http://localhost:4201` (`app-b`). Start both, then run the commands above. The first report must fail the match: app-b is the unstyled twin. Presentation edits belong in `app-b` styles and templates, then the loop repeats until the report matches.
