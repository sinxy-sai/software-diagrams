# Platform, host, and sandbox compatibility

## One layout, three hosts

| Host | What it reads | What it ignores |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` + `marketplace.json`; `skills/<name>/SKILL.md`; `commands/*.md` | — |
| Codex | `.codex-plugin/plugin.json` with `"skills": "./skills/"` | `commands/`, `.claude-plugin/` |
| dsh | `dsh.bundle` + `cordis.patch.yml`; or a skill root: `<project>/.dsh/skills`, `<project>/.agents/skills`, `~/.agents/skills` | `.claude-plugin/`, `.codex-plugin/`, `commands/` |

All three discover a directory bundle as `<name>/SKILL.md` at one level below the
root they scan. None of them descends into nested `skills/` directories, so a
repository root is never itself a skill root — point the host at the directory
that directly contains `software-diagrams/`.

A skill's name comes from its frontmatter `name` field, not its directory name,
and must be kebab-case. Unknown frontmatter keys are ignored; the two supported
invocation keys are the exact strings `disable-model-invocation` and
`user-invocable`.

The skill is self-contained: `SKILL.md`, `references/`, and `scripts/` all sit in
`skills/software-diagrams/`. Installing that one directory is enough — nothing
resolves to a repository-level path.

## Operating systems

| Platform | Runtime | First render needs |
|---|---|---|
| Windows 10/11 | Node 20+, npm; Java 17+ for PlantUML/Structurizr | `sd.mjs ensure <renderer>` |
| macOS | same; `tar` ships with the OS | same |
| Linux | same; `unzip` for the Structurizr archive | same |
| WSL | same as Linux, used inside WSL | same |

Mermaid, draw.io, D2, Graphviz, and the `resvg` PNG rasterizer need only Node.
PlantUML and Structurizr also need Java 17+; `doctor` prints the detected Java
version and reports both as `blocked` when it is missing or too old.

Native `d2` and `dot` binaries are never required. `resvg` ships a prebuilt
native module, so PNG output needs no compiler and no browser.

## Where renderers live

One directory, resolved in this order:

1. `$SOFTWARE_DIAGRAMS_TOOLS`, when set (relative values resolve against the
   current directory);
2. `~/.cache/software-diagrams/tools`, when writable;
3. `<project>/.dsh/tools`, when the home directory is not writable;
4. the OS temp directory, as a last resort.

The chosen directory is printed by `doctor`, `ensure`, and `render`, together
with the reason it was chosen. It can be deleted as a unit with
`sd.mjs reset --yes`, and it survives plugin upgrades.

Under a confined agent sandbox with a workspace-only write policy, the home
directory is not writable. The fallback in step 3 is what makes the skill work
there; npm's cache is also redirected inside the tools directory so installs do
not depend on the user's npm cache.

## Subprocess restrictions in a sandbox

A confined sandbox may forbid piped stdio between processes. The CLI avoids
pipes: commands that need output capture write to a temporary file and read it
back, and commands that do not need output inherit the terminal. This is why
`doctor` can still detect Java and why `ensure` can still run `npm` and `tar`.

`npm test` uses the Node test runner, which spawns a child process per test file.
In a sandbox that forbids those pipes, run the runner in-process instead:

```text
npm run test:agent
```

## Windows UTF-8 console

Before running a helper that prints non-ASCII text in Windows PowerShell,
initialise UTF-8 output:

```powershell
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
$env:PYTHONIOENCODING = 'utf-8'
```

If a helper reports `UnicodeEncodeError` for an emoji or Chinese text, treat it
as a console encoding failure and fix the session encoding before diagnosing a
missing renderer or an invalid diagram.