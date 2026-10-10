# Platform and agent compatibility

## Source of truth

Keep the diagram workflow in the repository root:

- `SKILL.md` contains the provider-neutral instructions.
- `scripts/` contains reproducible setup and rendering commands.
- `references/` contains tool-specific operational notes.
- `agents/openai.yaml`, `CLAUDE.md`, and `AGENTS.md` are host entrypoints or metadata only.

Do not maintain separate copies of the workflow for each model provider.

## Operating systems

| Platform | Required runtime | Setup | Render |
| --- | --- | --- | --- |
| Windows 10/11 | Node.js 20+, Java 17+, PowerShell 7+, npm | `pwsh ./scripts/bootstrap.ps1` | `pwsh ./scripts/render-all.ps1` |
| macOS | Node.js 20+, Java 17+, Bash, `curl`, `unzip`, npm | `bash ./scripts/bootstrap.sh` | `bash ./scripts/render-all.sh` |
| Linux | Node.js 20+, Java 17+, Bash, `curl`, `unzip`, npm | `bash ./scripts/bootstrap.sh` | `bash ./scripts/render-all.sh` |
| WSL | Node.js 20+, Java 17+, Bash, `curl`, `unzip`, npm | Use the Unix scripts inside WSL | Use the Unix scripts inside WSL |

The scripts download the pinned PlantUML and Structurizr versions into `tools/bin/`. Graphviz and D2 use the pinned Node/WASM packages, so native `dot` and `d2` binaries are not required. `drawio-headless` is rebuilt during bootstrap so its platform helper is available after `npm ci`.

The standard gallery is rendered from `examples/shop/` into `examples/shop/rendered/`. Run `npm ci` before bootstrap on a clean checkout.

## Agent hosts

| Host | Entry point | Notes |
| --- | --- | --- |
| Codex | Root skill folder plus `agents/openai.yaml` | Install the folder under the host's skills directory. `$software-diagrams` and the UI metadata are Codex features. |
| Claude Code | `CLAUDE.md`; optionally `.claude/skills/software-diagrams/SKILL.md` | Claude Code does not consume `agents/openai.yaml`. |
| OpenCode | `AGENTS.md` or its documented skills directory | Load the root `SKILL.md`; there is no portable `opencode.yaml` contract used here. |
| DeepSeek Harness | Harness skill/system-instruction configuration plus `SKILL.md` | The renderer scripts are independent of the model provider. Use `AGENTS.md` when the harness supports repository agent instructions. |
| Other agents | Their documented instruction or skill mechanism | Give the agent the root `SKILL.md` and keep the repository scripts available. |

The model provider does not change the renderer requirements. An agent must still have Node.js, Java, and the platform utilities listed above, plus network access during bootstrap unless the pinned tools are already cached.
