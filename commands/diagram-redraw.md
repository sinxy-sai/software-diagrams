---
description: Redraw or modernize an existing diagram into editable code
argument-hint: the artifact to redraw, or its path
---

Use the `software-diagrams` skill for the request below, then follow
`references/redraw.md` inside that skill end to end. The skill ships its own CLI
at `${CLAUDE_PLUGIN_ROOT}/skills/software-diagrams/scripts/sd.mjs`; use that path
for `doctor`, `ensure`, `render`, `lint`, and `validate`. Restate the recovered
structure and get confirmation before writing any source.

Request: $ARGUMENTS