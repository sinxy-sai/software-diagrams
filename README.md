# Software Diagrams

An open-source agent plugin for drawing professional computer-science diagrams
as editable code - and for turning diagrams you already have (screenshots,
whiteboard photos, PPT exports, draw.io files, stale DSLs) into editable code.

Works with **Claude Code**, **OpenAI Codex**, and **dsh** from one layout:
one self-contained skill, two slash commands, and one Node CLI.

## The two workflows

| You want | Command / skill | What happens |
|---|---|---|
| a new diagram that explains something | `/diagram` -> `software-diagrams` (authoring workflow) | frame the question -> asset contract -> pick renderer -> smallest complete model -> render -> three validation gates -> report |
| an existing picture turned into code | `/diagram-redraw` -> `software-diagrams` (`references/redraw.md`) | recover structure (nodes/edges/boundaries) -> **restate it to you for confirmation** -> author source -> render -> compare against the original |

The `software-diagrams` skill carries the vocabulary, the renderer selection
table, and both procedures: Structurizr for C4 (one model, many views), PlantUML
for precise UML, Mermaid for documentation-first flows, Graphviz for dependency
and call graphs, D2 for styled architecture views, draw.io for drag-and-drop.

Every diagram is delivered as **canonical source + SVG**, with a PNG where the
surface needs one: natively from Mermaid, PlantUML, draw.io, and Structurizr, and
through the pinned `resvg` rasterizer for Graphviz and D2. Generated images are
never hand-edited.

## Install

Each host reads its own manifest: `.claude-plugin/` for Claude Code,
`.codex-plugin/plugin.json` for Codex, and the `dsh` npm bundle in `package.json`
for dsh. Per-host steps, shared-skill roots, and verification live in
[docs/install.md](docs/install.md).

Claude Code marketplace install:

```
/plugin marketplace add sinxy-sai/software-diagrams
/plugin install software-diagrams@software-diagrams
```

From a local clone: `claude --plugin-dir .`

## Renderers are not preinstalled - that is the point

Nothing is downloaded at plugin install time. Each renderer arrives the first
time a diagram needs it, into one directory you can open in a file manager.

The CLI at `skills/software-diagrams/scripts/sd.mjs` has six commands:
`doctor` (what is really usable), `ensure` (install pinned renderers),
`render` (one source to SVG or PNG), `lint` (visual defects in a render),
`validate` (a diagram manifest and its links), and `reset --yes` (delete the
tools directory).

```
node skills/software-diagrams/scripts/sd.mjs doctor        # ready | stale | missing | broken | blocked
node skills/software-diagrams/scripts/sd.mjs ensure plantuml
                                            # installs into $SOFTWARE_DIAGRAMS_TOOLS,
                                            # else ~/.cache/software-diagrams/tools/
```

The tools directory survives plugin upgrades, records what it installed in
`installed.json`, and can be deleted as a unit. No renderer ever lands inside a
plugin cache, skill directory, or your project.

Requirements: Node.js 20+ everywhere; Java 17+ only for PlantUML and
Structurizr. PNG from Graphviz or D2 needs the `resvg` rasterizer
(`ensure resvg`), which is Node-only.

## Layout

```
.claude-plugin/            Claude Code plugin and marketplace manifests
.codex-plugin/             Codex plugin manifest
commands/                  diagram.md, diagram-redraw.md - thin shells
skills/software-diagrams/  one skill: SKILL.md, scripts/sd.mjs, scripts/lib/, references/
dsh-plugin.js              dsh bundle entry; cordis.patch.yml is its layer
examples/                  decision cases - when to pick which renderer, what bad looks like
docs/install.md            per-host install and verification
tests/                     node --test, zero dependencies
```

## Development

```
npm test                              # L1 unit tests (explicit file list, Node 20+)
node skills/software-diagrams/scripts/sd.mjs doctor
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the per-host install rehearsal
(L3) and [AGENTS.md](AGENTS.md) for the rules that bind every change.

MIT licensed.