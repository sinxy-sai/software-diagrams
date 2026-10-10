# Agent instructions

This repository contains a portable software-diagrams skill. For any task that creates, edits, renders, or embeds a software engineering diagram, read [`SKILL.md`](SKILL.md) before choosing a DSL or renderer.

Use the checked-in toolchain and platform script:

- Windows: `pwsh ./scripts/bootstrap.ps1` then `pwsh ./scripts/render-all.ps1`
- macOS/Linux: `bash ./scripts/bootstrap.sh` then `bash ./scripts/render-all.sh`

Keep diagram source files editable and reviewable. Do not rely on globally installed `dot`, `d2`, PlantUML, or Structurizr when the repository-local tools provide the same capability. Preserve source files when producing PNG/SVG outputs.

`agents/openai.yaml` is optional Codex metadata. It is not required for the workflow in `SKILL.md`.
