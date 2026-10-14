# Software Diagrams

An open-source agent plugin for drawing professional computer-science diagrams
as editable code — and for turning diagrams you already have (screenshots,
whiteboard photos, PPT exports, draw.io files, stale DSLs) into editable code.

Works with **Claude Code**, **OpenAI Codex**, and **dsh** from one layout:
three skills, two slash commands, and one Node CLI.

## The two workflows

| You want | Command / skill | What happens |
|---|---|---|
| a new diagram that explains something | `/diagram` → `diagram-authoring` | frame the question → asset contract → pick renderer → smallest complete model → render → three validation gates → report |
| an existing picture turned into code | `/diagram-redraw` → `diagram-redraw` | recover structure (nodes/edges/boundaries) → **restate it to you for confirmation** → author source → render → compare against the original |

The router skill `software-diagrams` carries the vocabulary and the renderer
selection table: Structurizr for C4 (one model, many views), PlantUML for
precise UML, Mermaid for documentation-first flows, Graphviz for dependency
and call graphs, D2 for styled architecture views, draw.io for drag-and-drop.

Every diagram is delivered as **canonical source + SVG + PNG** unless you say
otherwise. Generated images are never hand-edited.

## Install

Claude Code:

```
/plugin marketplace add sinxy-sai/software-diagrams
/plugin install software-diagrams@software-diagrams
```

From a local clone: `claude --plugin-dir .`

Codex / dsh: the `skills/<name>/SKILL.md` layout is one level deep, which both
discover; install the three skill folders through your host's normal skill
mechanism (e.g. `npx skills add sinxy-sai/software-diagrams`). Official Codex
plugin-manifest support lands after the L3 install rehearsal in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Renderers are not preinstalled — that is the point

Nothing is downloaded at plugin install time. Each renderer arrives the first
time a diagram needs it, into one directory you can open in a file manager:

```
node scripts/sd.mjs doctor              # ready | stale | missing | blocked
node scripts/sd.mjs ensure plantuml     # installs into $SOFTWARE_DIAGRAMS_TOOLS,
                                        # else ~/.cache/software-diagrams/tools/
```

The tools directory survives plugin upgrades, records every version and
checksum in `installed.json`, and can be deleted as a unit. No renderer ever
lands inside a plugin cache, skill directory, or your project.

Requirements: Node.js 20+ everywhere; Java 17+ only for PlantUML and
Structurizr.

## Layout

```
.claude-plugin/       plugin + marketplace manifests
commands/             diagram.md, diagram-redraw.md — thin shells
skills/               software-diagrams (router) · diagram-authoring · diagram-redraw
scripts/sd.mjs        doctor · ensure        (render, validate, reset landing next)
examples/             decision cases — when to pick which renderer, what bad looks like
tests/                node --test, zero dependencies
```

## Development

```
npm test              # L1 unit tests (Node >= 21 for the test-runner glob)
node scripts/sd.mjs doctor
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the per-host install rehearsal
(L3) and [AGENTS.md](AGENTS.md) for the rules that bind every change.

MIT licensed.
