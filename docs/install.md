# Install software-diagrams

One skill, `software-diagrams`, packaged for Claude Code, OpenAI Codex, and
dsh. Each host has its own manifest; all of them point at the same skill
directory.

```
.codex-plugin/plugin.json    Codex plugin manifest
.claude-plugin/              Claude Code plugin and marketplace manifests
dsh-plugin.js                dsh bundle entry
cordis.patch.yml             dsh bundle layer
skills/software-diagrams/    SKILL.md, scripts/sd.mjs, references/
```

Installing the plugin does not install renderers. `sd.mjs ensure` downloads
them later into `$SOFTWARE_DIAGRAMS_TOOLS`, or `~/.cache/software-diagrams/tools/`
when that variable is unset. PlantUML and Structurizr also require Java 17+.

## Claude Code

Marketplace install:

```
/plugin marketplace add sinxy-sai/software-diagrams
/plugin install software-diagrams@software-diagrams
```

From a local checkout:

```
claude --plugin-dir .
```

Claude Code reads `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
and discovers the skill under `skills/`.

## Codex

Codex reads `.codex-plugin/plugin.json`. The manifest sets
`"skills": "./skills/"`, so the installed plugin exposes the one skill in that
directory.

Install the plugin through Codex's plugin marketplace or its `codex plugin`
command family. For a local checkout the entry point is:

```
codex plugin marketplace add <path-to-checkout>
```

The exact subcommands vary by Codex version; the manifest is at
`.codex-plugin/plugin.json` either way.

Shared-skill route, without a plugin install: copy the skill directory to the
user root or the project root. Codex reads skill bundles one level deep as
`<name>/SKILL.md`.

```
# user
mkdir -p ~/.agents/skills
cp -R skills/software-diagrams ~/.agents/skills/
```

```
# project
mkdir -p .agents/skills
cp -R skills/software-diagrams .agents/skills/
```

On Windows use `Copy-Item -Recurse skills/software-diagrams <destination>`.
The copied directory must keep its name, `software-diagrams`.

## dsh

dsh has two routes: an npm bundle that registers a skill provider, or a shared
skill root that dsh scans directly.

### Route 1: npm bundle

The package manifest carries:

```json
"dsh": {
  "bundle": {
    "patch": "./cordis.patch.yml"
  }
}
```

`cordis.patch.yml` inserts one plugin row that references the package by name.
That row loads the package entry, `dsh-plugin.js`, which registers the
`skills/software-diagrams/SKILL.md` provider through `ctx.skills`. The provider
reports the skill as bundled, at rank 600.

Once published, install the package into a profile:

```
dsh plugin --profile <name> add software-diagrams
```

From a checkout instead of the registry (run this at the checkout root):

```
dsh plugin --profile <name> add ./
```

Then boot that profile:

```
dsh --profile <name> --dump-config   # the bundle layer appears in the dump
dsh --profile <name>
```

To remove it: `dsh plugin --profile <name> remove software-diagrams`.

### Route 2: shared skill root

Copy `skills/software-diagrams/` into one of these roots:

| Root | Rank |
|---|---|
| `<project>/.dsh/skills/` | 100 |
| `<project>/.agents/skills/` | 200 |
| `~/.agents/skills/` | 500 |

```
# project dsh root
mkdir -p .dsh/skills
cp -R skills/software-diagrams .dsh/skills/
```

```
# user shared root
mkdir -p ~/.agents/skills
cp -R skills/software-diagrams ~/.agents/skills/
```

dsh discovers `<name>/SKILL.md` only at one level, and the frontmatter `name`
must be kebab-case. The skill name is `software-diagrams`.

dsh does not read `.claude-plugin/` or `commands/`. The shared route copies
only `skills/software-diagrams/` (its `SKILL.md`, `scripts/`, and
`references/`).

## Verify

In every host, start a session and open its skill catalog. Confirm
`software-diagrams` is listed:

- Claude Code: `/plugin` shows the installed plugin; the skill is in the
  session catalog.
- Codex: the installed plugin, or the `.agents/skills/` copy, appears in the
  plugin/skill catalog.
- dsh: the session skill catalog lists it. `dsh --profile <name> --dump-config`
  also shows the bundle layer or the installed skill root.

Then run the skill's own toolchain from the checkout, or from the installed
skill directory:

```
node skills/software-diagrams/scripts/sd.mjs doctor
node skills/software-diagrams/scripts/sd.mjs ensure graphviz d2
node skills/software-diagrams/scripts/sd.mjs render examples/shop/sources/graphviz-dependencies.dot -o examples/shop/rendered/graphviz-dependencies.svg
node skills/software-diagrams/scripts/sd.mjs lint examples/shop/rendered/graphviz-dependencies.svg
```

`doctor` reports each renderer as ready, stale, missing, broken, or blocked, and
exits nonzero while any renderer is not ready; that is expected before `ensure`.
`ensure` installs the named renderers. The `render` command must leave a
non-empty SVG at the given output path, and `lint` must parse it and print no
errors.

## What each host reads

| Host | Host manifest | Skill source | Not read by this host |
|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | `skills/` through the plugin | `.codex-plugin/`, `dsh.bundle` |
| Codex plugin | `.codex-plugin/plugin.json` | `skills/` through `"skills": "./skills/"` | `.claude-plugin/`, `cordis.patch.yml` |
| Codex shared | none | `~/.agents/skills/software-diagrams/` or `<project>/.agents/skills/software-diagrams/` | host manifests |
| dsh bundle | `package.json` (`dsh.bundle`) plus `cordis.patch.yml` | `skills/software-diagrams/` through `dsh-plugin.js` | `.claude-plugin/`, `commands/` |
| dsh shared | none | `.dsh/skills/` (100), `.agents/skills/` (200 project, 500 user) | `.claude-plugin/`, `commands/` |
| Shared | none | a copy of `skills/software-diagrams/` in the host's skill root | host manifests |