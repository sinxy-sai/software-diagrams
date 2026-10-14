# Platform and agent compatibility

## Source of truth

One layout serves every host:

- `skills/<name>/SKILL.md` — the workflow text, three skills, flat one level deep.
- `commands/*.md` — thin shells that invoke a skill.
- `scripts/` — the `sd.mjs` CLI and its modules; renderers install lazily into the tools directory.
- `AGENTS.md` is the primary entry point (Codex reads only it; dsh reads it plus `CLAUDE.md`); `CLAUDE.md` is a pointer; `agents/openai.yaml` is Codex UI metadata.

Do not maintain separate copies of the workflow for each model provider.

## Operating systems

| Platform | Required runtime | First render needs |
| --- | --- | --- |
| Windows 10/11 | Node.js 20+, Java 17+ for PlantUML/Structurizr, npm | `node scripts/sd.mjs ensure <renderer>` |
| macOS | Node.js 20+, Java 17+, Bash, `curl`, `unzip`, npm | same |
| Linux | Node.js 20+, Java 17+, Bash, `curl`, `unzip`, npm | same |
| WSL | same as Linux, used inside WSL | same |

Renderers arrive lazily into one directory — `$SOFTWARE_DIAGRAMS_TOOLS`, else
`~/.cache/software-diagrams/tools/` — and that directory outlives plugin
upgrades. `node scripts/sd.mjs doctor` reports each renderer as `ready`,
`stale`, `missing`, or `blocked`. `ensure` fails visibly under sandbox write
restrictions: it prints the path it wanted and how to set
`SOFTWARE_DIAGRAMS_TOOLS`. Never install renderers inside a plugin, skill, or
host project directory.

PlantUML and Structurizr need Java. Mermaid, draw.io, and the WASM renderers
(D2, Graphviz) need only Node. Native `dot` and `d2` binaries are never
required.

## Agent hosts

| Host | Discovers | Notes |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` + `marketplace.json` | skills land namespaced; plugin cache has GC — another reason downloads never go there |
| Codex | `.codex-plugin/plugin.json` (phase 2), or `npx skills add` into `.agents/skills` | reads `AGENTS.md`, not `CLAUDE.md` |
| dsh | one level: `<root>/<name>/SKILL.md` | reads `AGENTS.md` and `CLAUDE.md`; the flat `skills/` layout satisfies it |

The model provider does not change the renderer requirements. An agent must
still have Node.js — plus Java and platform utilities where the chosen
renderer needs them — and network access on first `ensure` unless the pinned
tools are already in the tools directory.

## Windows UTF-8 diagnostics

Before running Python, `npx`, or a helper that prints non-ASCII text in
PowerShell 7, initialize UTF-8 output:

```powershell
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
$env:PYTHONIOENCODING = 'utf-8'
```

If a helper reports `UnicodeEncodeError` for an emoji or Chinese text, treat
it as a console encoding failure. Fix the session encoding and retry before
diagnosing a missing skill or an invalid diagram.
