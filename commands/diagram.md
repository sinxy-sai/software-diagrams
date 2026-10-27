---
description: Draw a new computer-science diagram from editable source
argument-hint: the question the diagram should answer
---

Use the `software-diagrams` skill for the request below and follow it end to
end. The skill ships its own CLI at
`${CLAUDE_PLUGIN_ROOT}/skills/software-diagrams/scripts/sd.mjs`; use that path
for `doctor`, `ensure`, `render`, `lint`, and `validate`. Do not restate or
improvise the skill's steps here.

Request: $ARGUMENTS