# Project workflow for software diagrams

Use this reference when diagrams are added to an existing repository, especially
one with staged changes or a publication policy.

## 1. Write the asset contract first

Before creating files, write one row per diagram:

| id | purpose | canonical source | renderer | outputs | documents | publication |
|---|---|---|---|---|---|---|
| `system-overview` | explain module boundaries | `docs/diagrams/sources/system-overview.mmd` | Mermaid | `docs/diagrams/rendered/system-overview.svg` | `docs/architecture.md` | both |

An equivalent JSON manifest is what `sd.mjs validate` reads:

```json
{
  "profile": "tracked-source",
  "diagrams": [
    {
      "id": "system-overview",
      "purpose": "explain module boundaries",
      "source": "docs/diagrams/sources/system-overview.mmd",
      "renderer": "mermaid",
      "outputs": ["docs/diagrams/rendered/system-overview.svg"],
      "documents": ["docs/architecture.md"],
      "publication": "both"
    }
  ]
}
```

The `source` is the only canonical model. A Markdown Mermaid block is canonical
only when it is explicitly named as the source; do not also create a copied
`.mmd` file. Do not list a second source holding the same model.

## 2. Select a publication profile

- `tracked-source` — source and selected outputs are reviewable and published.
  Default for professional diagrams.
- `local-source/published-artifacts` — source and toolchain stay local; selected
  outputs are published.
- `local-only-preview` — source and outputs stay local.

Per diagram, `publication` is `source`, `output`, `both`, or `local`, and must
agree with the profile.

The tools directory lives outside the repository by default, so downloads need
no ignore rule. Never install a renderer inside the repository; if one already
exists there, move it out or set `SOFTWARE_DIAGRAMS_TOOLS`.

## 3. Protect Git state

When Git state must be preserved, record a preflight before writing:

```powershell
git status --porcelain=v2 --untracked-files=all
git diff --cached --name-status
git log -n 5 --format=%s
git branch --show-current
git rev-parse HEAD
git remote -v
```

Write new paths where possible. Do not run `git add -A`, `git reset`,
`git restore --staged`, `git commit`, or `git push` unless the user explicitly
asks. If the user asks for a commit, stage only the declared publish set. Repeat
the preflight after the work and report every changed path, branch, and HEAD.

## 4. Render the project's diagrams

`doctor` only reports; `ensure` only installs; `render` only renders. None of
them edits the project being documented.

1. Run the project's own render command if it has one and it matches the
   canonical source.
2. Otherwise run `sd.mjs doctor`; for every renderer reported `missing` or
   `broken`, run `sd.mjs ensure <renderer>` first.
3. Render every output listed in the manifest, SVG first.
4. Stop on the first renderer error and repair the canonical source.
5. Record the exact commands, renderer versions, and output paths.

`examples/shop/` in this repository is a gallery of checked-in sources; it is not
discovered automatically in another repository.

## 5. Validate links and assets

- every document path in the manifest exists;
- every listed output exists after rendering;
- every Markdown link and image reference resolves;
- every published output maps back to one canonical source;
- no source or output is orphaned or silently omitted;
- source and output basenames match for one-source/one-output diagrams;
  multi-view sources list each output explicitly.

Run the structural gate rather than eyeballing it:

```text
node <skill-dir>/scripts/sd.mjs validate <manifest>
```

Then perform the visual check: cropped edges, overlapping nodes, missing fonts,
unreadable text, wrong arrow direction, excessive whitespace, and Chinese glyph
failures. A file existing on disk is not visual validation.

## 6. Report completion

Include created and modified files; the canonical source for each diagram;
published versus local-only files; exact render commands and versions; link and
visual-check results; the Git preflight and postflight summary; and unresolved
risks or assumptions.