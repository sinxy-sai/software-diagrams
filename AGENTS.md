# Agent instructions

This repository is an open-source agent plugin: one self-contained skill, two
slash commands, and one Node CLI for drawing computer-science diagrams as
editable source. It targets Claude Code, OpenAI Codex, and dsh from a single
layout.

## Layout

- `skills/software-diagrams/` - the one skill: `SKILL.md` (vocabulary, routing,
  authoring workflow), `references/` (redraw procedure, toolchain, project
  workflow, compatibility, Figma handoff), and the CLI below.
- `skills/software-diagrams/scripts/sd.mjs` - the only CLI entry: `doctor`,
  `ensure`, `render`, `validate`, `reset`.
- `skills/software-diagrams/scripts/lib/` - toolchain modules; `tests/` -
  `node --test`, zero dependencies.
- `commands/` - thin shells that invoke the skill; procedures never live here.
- `docs/install.md` - per-host install and verification.
- `examples/` - decision cases at repo level, not installed.

## Rules that bind every change

- Renderers are not preinstalled. They install lazily into exactly one
  directory: `$SOFTWARE_DIAGRAMS_TOOLS`, else
  `~/.cache/software-diagrams/tools/`. Never download or vendor a renderer
  dependency into a plugin directory, a skill directory, a plugin cache, or a
  host project.
- The skill must stay self-contained when installed alone: `SKILL.md`,
  `references/`, and `scripts/` resolve only inside `skills/software-diagrams/`.
- Shared logic lives in scripts or in deliberately duplicated short text. One
  fact has one source: renderer versions live in the registry, path joining
  lives in the tools module, failure verdicts in one validator.
- The canonical source is the only editable model; generated SVG/PNG is never
  hand-edited.
- Pure planning functions (`planEnsure`, render-plan, manifest checks) touch no
  fs, network, or child process; IO runs through injected collaborators so L1
  tests need no Java, browser, or network.

## Working in this repo

- Tests: `npm test`, which runs the explicit file list in `package.json`
  `scripts.test` through `node --test`. The runtime floor is Node 20;
  `node --test tests/` fails.
- Environment floors and the Windows UTF-8 console diagnosis are in
  `skills/software-diagrams/references/compatibility.md`.
- Git hygiene: stage exact paths, never `git add -A`; no `git reset`, history
  rewriting, or pushing unless the owner asks; commit messages carry no
  `Co-Authored-By` trailer.