# UX parity agent

When the task is to make one UI match another, follow `.cursor/skills/ux-parity/SKILL.md` before editing.

The reference is the traversable site in the manifest (production, or `app-a` on port 4200 in this fixture). The target is the localhost app (`app-b` on port 4201 in this fixture). Edit presentation only, inside `target.sourceRoot` and `editAllowlist`.

The score is `node tools/ux-parity/src/cli.js run`. A screenshot is evidence for a cluster. `report.json` decides when the UIs match. Stop when `matched` is true and `guard` passes, or when the skill's plateau / blocked-logic rule is met.

Each production app supplies its own manifest. Do not hardcode this student-registration form into the fix.
