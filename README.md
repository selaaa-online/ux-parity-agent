# UX Mismatches — Student Registration

Two Angular apps with the **same form + grid structure and element IDs**, different presentation.

| App | Port | UI |
|-----|------|----|
| `app-a` | 4200 | Polished layout and styling |
| `app-b` | 4201 | Plain / unstyled browser defaults |

## Run

```bash
# Terminal 1
cd app-a
npm start

# Terminal 2
cd app-b
npm start -- --port 4201
```

- App A: http://localhost:4200  
- App B: http://localhost:4201  

## UX parity agent

`app-a` is the reference look. `app-b` is the localhost target. The agent and the judge are generic: one manifest per app, same CLI for any web UI.

```bash
cd tools/ux-parity
npm install
npx playwright install chromium
cd ../..
node tools/ux-parity/src/cli.js run --manifest ux-parity.manifest.json --out ux-parity-out
```

Exit code 2 means the measured UIs still differ. The procedure is `.cursor/skills/ux-parity/SKILL.md`. The agent edits presentation under `app-b` only, then re-runs until `report.json` says `matched: true`.

## Shared elements

Both apps use matching `id` attributes for automation / UX comparison, including:

- Form: `#student-form`, `#input-first-name`, `#input-last-name`, `#input-email`, `#input-phone`, `#select-course`, `#input-enrollment-date`, `#btn-submit`, `#btn-reset`
- Grid: `#students-grid`, `#students-count`, `#students-empty`, row/cell ids like `#student-row-1`, `#btn-delete-1`

Adding a student appends a row to the grid in that app.
