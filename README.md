# Software diagrams skill

Create software engineering diagrams as code with Mermaid, PlantUML, Structurizr DSL, D2, Graphviz DOT, and draw.io XML. The repository contains the reusable Codex skill, pinned rendering helpers, editable examples, and documentation for embedding diagrams in Markdown, LaTeX, and office/design tools.

## What is included

- `SKILL.md` — the Codex skill entrypoint and tool-selection workflow.
- `agents/openai.yaml` — optional Codex UI metadata.
- `references/` — renderer setup, output conventions, and troubleshooting.
- `scripts/` — reproducible setup and one-command rendering helpers.
- `examples/shop/` — a complete multi-format example with editable sources and generated outputs.
- `package.json` / `package-lock.json` — pinned Node dependencies for WASM Graphviz, D2, draw.io headless, and Mermaid CLI.

## Install

### Install the skill with the skills CLI

For agent use, install the published repository directly:

```bash
npx skills add sinxy-sai/software-diagrams
bunx skills add sinxy-sai/software-diagrams
pnpm dlx skills add sinxy-sai/software-diagrams
```

`skills find` searches an external index and may lag behind a GitHub repository. If the exact name is not found but the repository is known, use the direct command above. Installing the skill only installs its instructions; it does not install the diagram renderers.

Use `--agent` to select an agent or `--all` to install for every supported agent. The CLI reads the root `SKILL.md`; it does not require the renderer dependencies in this repository.

### Host-specific entrypoints

The workflow is provider-neutral:

- Codex uses [`agents/openai.yaml`](agents/openai.yaml) for UI metadata.
- Claude Code can use [`CLAUDE.md`](CLAUDE.md).
- OpenCode and DeepSeek Harness can use [`AGENTS.md`](AGENTS.md) or their documented skill directories.

See [platform and agent compatibility](references/compatibility.md) for the complete matrix.

### Clone the repository for local rendering

Clone the repository when you need the examples, pinned renderers, or one-command gallery validation.

### Prerequisites

- Node.js 20 or newer (Node 22 is recommended).
- Java 17 or newer for PlantUML and Structurizr CLI.
- PowerShell 7 on Windows, or Bash plus `curl`/`unzip` on macOS/Linux.

On Windows, use a UTF-8 PowerShell session before running search or render helpers:

```powershell
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
$env:PYTHONIOENCODING = 'utf-8'
```

If a command reports `UnicodeEncodeError`, fix the console encoding first. Treating that error as a missing skill or broken diagram produces a false diagnosis.

### Clone and install dependencies

```bash
git clone <your-repository-url> software-diagrams
cd software-diagrams
npm ci
```

Download the pinned Java tools:

```powershell
pwsh ./scripts/bootstrap.ps1
```

On macOS/Linux:

```bash
bash ./scripts/bootstrap.sh
```

The bootstrap scripts put the configured PlantUML and Structurizr versions under `tools/bin/` when those files are absent. They are intentionally not committed to Git; versions and official download URLs are pinned in the scripts.
They also rebuild the draw.io native helper if npm skipped its postinstall script.

## Render the example gallery

```powershell
pwsh ./scripts/render-all.ps1
```

```bash
bash ./scripts/render-all.sh
```

Outputs are written to `examples/shop/rendered/`. The command validates Structurizr, renders Mermaid/PlantUML/D2/Graphviz/draw.io, and exits non-zero if a renderer fails.

For a project-specific JSON asset manifest, validate paths and rendered outputs with:

```bash
npm run validate:manifest -- diagram-manifest.json <project-root>
```

The gallery render command and manifest validator check different things: the former checks this repository's pinned renderer gallery; the latter checks the files and document references declared by a user's project.

## Use the skill

The skill entrypoint is [SKILL.md](SKILL.md). If you are working from a local clone and want a direct Codex install, copy the repository's skill folder into the Codex skills directory:

For a direct local install in Codex:

```powershell
Copy-Item -Recurse . "$env:CODEX_HOME\skills\software-diagrams"
```

If `CODEX_HOME` is not set, use `%USERPROFILE%\.codex\skills\software-diagrams` on Windows or `~/.codex/skills/software-diagrams` on macOS/Linux.

Release assets contain a smaller standalone `software-diagrams-<tag>.tar.gz` skill package; the repository tag archive contains the complete examples and renderer tooling.

## Example gallery

Open [examples/shop/README.md](examples/shop/README.md) for the source files, rendered SVG/PNG outputs, and Markdown/LaTeX embedding snippets.

## Design goals

1. Keep diagram sources editable and reviewable.
2. Keep generated images reproducible from a clean checkout.
3. Choose the DSL that best matches the diagram's semantics.
4. Make outputs usable in Markdown, LaTeX, diagrams.net, Figma, Inkscape, Word, and PowerPoint.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please include source changes, rerender affected examples, and document any new runtime dependency or licensing constraint.

## Security

Please report vulnerabilities privately through the process in [SECURITY.md](SECURITY.md), rather than opening a public issue.
