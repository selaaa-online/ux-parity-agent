# Manifest

`ux-parity` reads one JSON manifest per app. Paths in `target.sourceRoot` and `editAllowlist` are relative to the manifest's directory unless `root` says otherwise. Strings may contain `${ENV:VARIABLE_NAME}`. The process fails if that variable is empty. Never put passwords in the file.

## Topology

| Field | Meaning |
| --- | --- |
| `reference.baseUrl` | Traversable site whose look is the source of truth. Often production. |
| `reference.allowMutations` | Default `false`. Set `true` only for a disposable account or a local sandbox. |
| `reference.storageState` | Optional Playwright storage state. File must exist and stay uncommitted. |
| `reference.login` | Optional `{ path, readySelector, steps }` run before flows. Step values may use `${ENV:...}`. |
| `target.baseUrl` | Localhost app to change. |
| `target.sourceRoot` | Directory the agent may edit. |
| `target.editAllowlist` | Globs for styles, templates, fonts, and images. TypeScript and logic files stay off this list. |
| `readySelector` | Element that must exist after each navigation. |
| `viewports` | `{ name, width, height }` for every width the look must survive. Include the layout breakpoint, not only desktop. |
| `flows` | Ordered user paths. At least one. |
| `crawl` | `{ "actions": ["hover", "focus", "probe"] }` or `false`. |
| `ignore.selectors` | Nodes painted black in both screenshots and dropped from the style compare. Use for ads, live clocks, and third-party widgets. |
| `ignore.styleProperties` | Computed properties that must not affect the score. |
| `thresholds` | Stop bar. See [scoring.md](scoring.md). |
| `limits.maxStates` | Cap on screenshots. Default 80. |
| `limits.maxCrawlActions` | Cap on extra hover/focus controls. Default 24 in code, raise it for dense screens. |
| `limits.maxNodes` | Cap on elements measured per screen. Ids, `html`, `body`, and the app root are kept first. |

The target's `login` and `allowMutations` use the same shape as the reference. Target mutations default to allowed.

## Flow steps

```json
{
  "id": "register",
  "path": "/enroll",
  "mutates": true,
  "steps": [
    { "id": "email", "action": "fill", "selector": "#email", "value": "ada@university.edu", "capture": false },
    { "id": "submit", "action": "click", "selector": "#submit", "expect": { "visible": ["#result"] } }
  ]
}
```

Actions: `fill`, `click`, `select`, `hover`, `focus`, `press`, `check`, `probe`. `probe` only evaluates `expect`. `capture: false` skips a screenshot for that step; the expectation still runs.

`expect` fields: `visible`, `hidden`, `disabled`, `enabled`, `text` (selector to exact string), `urlContains`.

Alignment of elements is by `id`, then by a unique role plus accessible name, then by structural path. Prefer stable ids in both apps. The tool still runs when ids differ.

`mutates: true` means the steps change stored data (create, update, delete, pay, send). When `reference.allowMutations` is false, the tool screenshots the flow's initial page on both sides and runs the mutating steps only on the target. Post-condition visuals for those steps are skipped. Behavior expectations still run on the target.

## Production shape

```json
{
  "name": "billing",
  "readySelector": "#app",
  "reference": {
    "baseUrl": "https://billing.example.com",
    "allowMutations": false,
    "storageState": "secrets/billing-prod.json"
  },
  "target": {
    "baseUrl": "http://localhost:4200",
    "sourceRoot": "apps/billing",
    "editAllowlist": ["apps/billing/**/*.css", "apps/billing/**/*.scss", "apps/billing/**/*.html"]
  },
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "narrow", "width": 390, "height": 844 }
  ],
  "flows": [
    { "id": "home", "path": "/invoices", "steps": [] }
  ]
}
```

Create the storage state with a disposable or read-only account. Traversing production is navigation, hover, and focus. Creating or deleting production data stays off unless `allowMutations` is true.

## Fixture

`ux-parity.manifest.json` in this repo points the reference at `http://localhost:4200` and the target at `http://localhost:4201`, with mutations allowed because both processes are local sandboxes.
