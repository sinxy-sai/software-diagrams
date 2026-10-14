# Contributing

Thanks for helping improve the software diagrams skill.

## Development setup

1. Install Node.js 21+ (the test runner glob needs it; runtime floor is 20), Java 17+ if you will touch PlantUML or Structurizr, and PowerShell 7 or Bash.
2. Run `npm test` — L1 unit tests are dependency-free and need no renderer.
3. Run `node scripts/sd.mjs doctor`; `node scripts/sd.mjs ensure <renderer>` pulls a pinned renderer into the tools directory when a render needs one.

## Making changes

- Keep each `SKILL.md` focused on decisions and workflow. Put lengthy tool-specific details in that skill's own `references/` — a skill must stay self-contained when installed alone, so never reference another skill's files.
- Commands are thin shells; procedures live in skills only.
- Renderer versions live in the registry under `scripts/lib` in exactly one place; never restate a version in docs or skill text.
- Add or update an editable source file before changing a generated image.
- Use stable ASCII IDs in diagram sources and keep relationship labels short.
- Never install renderer dependencies into a plugin directory, skill directory, or host project; they belong only in the tools directory.
- If a tool requires a network download, pin the version and record the official source URL.
- Preserve third-party license notices when adding templates, fonts, icons, or examples.

## Validation

```bash
npm test
node scripts/sd.mjs doctor
```

Review generated SVG/PNG files for clipping, overlap, unreadable text, incorrect arrows, and missing nodes. Structurizr must validate successfully before its views are exported.

## Per-host install rehearsal (L3, before each release)

A layout mistake fails silently — the plugin installs but no host discovers the
skills — so run this by hand on each release:

```
claude --plugin-dir .                      -> 3 skills and 2 commands listed
/plugin marketplace add <local path>       -> install, namespaced skill listing works
npx skills add <repo>                      -> copies land where Codex/dsh list them
dsh: copy a skill folder into its skills root -> one-level discovery works, kebab-case name validates
```

## Pull requests

Describe:

- what diagram or workflow changed;
- which source and generated files changed;
- the exact render command used;
- any new dependency, version, or license consideration.

Keep pull requests focused. Do not include generated dependency directories or unrelated project files.
