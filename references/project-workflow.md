# Project workflow for software diagrams

Use this reference when diagrams are being added to an existing repository, especially when the repository has staged changes or a publication policy.

## 1. Write the asset contract first

Before creating files, write a small table or manifest with one row per diagram:

| id | purpose | canonical source | renderer | outputs | documents | publication |
|---|---|---|---|---|---|---|
| `system-overview` | explain module boundaries | `docs/diagrams/sources/system-overview.mmd` | Mermaid | `docs/assets/diagrams/system-overview.svg` | `docs/architecture.md` | output |

Do not generate a diagram that has no document or delivery purpose. Do not create a second source file containing the same model.

An equivalent JSON manifest is useful for automation:

```json
{
  "profile": "local-source/published-artifacts",
  "diagrams": [
    {
      "id": "system-overview",
      "purpose": "explain module boundaries",
      "source": "docs/diagrams/sources/system-overview.mmd",
      "renderer": "mermaid",
      "outputs": ["docs/assets/diagrams/system-overview.svg"],
      "documents": ["docs/architecture.md"],
      "publication": "output"
    }
  ]
}
```

The `source` is the only canonical model. A Markdown Mermaid block is canonical only when it is explicitly selected as `source`; do not also create a copied `.mmd` file.

## 2. Select a publication profile

Choose one profile before editing files:

- `tracked-source`: source and selected rendered outputs are tracked and published.
- `local-source/published-artifacts`: source and renderer toolchain stay local; selected SVG/PNG outputs are published.
- `local-only-preview`: source and outputs stay local; documents may embed them only in a local preview workflow.

For every profile, record the allowed publish set. Add narrow ignore rules only when needed, such as `docs/diagrams/sources/`, `tools/bin/`, or `node_modules/`. Never replace an existing `.gitignore` wholesale and never assume `tools/` can be ignored safely without checking the repository.

## 3. Protect Git state

Before any write in a repository with existing work:

```powershell
git status --porcelain=v2 --untracked-files=all
git diff --cached --name-status
```

Keep the output as the preflight record. Write new paths where possible. Do not run `git add -A`, `git reset`, `git restore --staged`, `git commit`, or `git push` unless the user explicitly asks for that operation.

If the user explicitly asks for a commit, stage only the declared publish set. Do not use `git commit-tree`, `git update-ref`, or a temporary `GIT_INDEX_FILE` as a shortcut. If preserving an existing staged state requires an unusual index operation, stop and explain the conflict before mutating it.

After the work, run the same two commands and compare the preflight and postflight records. Report any changed staged or unstaged path.

## 4. Render the user's project

The repository's `scripts/render-all.ps1` and `scripts/render-all.sh` validate only the checked-in `examples/shop/` gallery. Passing that gallery does not prove that a user's project diagram rendered successfully.

For a user project:

1. Run the project's own renderer if it exists.
2. Otherwise use the pinned renderer commands from `references/toolchain.md`.
3. Render every output listed in the manifest.
4. Stop on the first renderer error and repair the canonical source.
5. Print the exact commands, renderer versions, and output paths.

Keep bootstrap separate from rendering:

```powershell
pwsh ./scripts/bootstrap.ps1
pwsh ./scripts/render-all.ps1
```

The first command prepares the gallery toolchain. The second command validates the gallery. Neither command automatically discovers diagrams in another repository.

## 5. Validate links and assets

Check all of the following before delivery:

- every document path in the manifest exists;
- every output exists after rendering;
- every Markdown relative link and image reference resolves;
- every published output maps back to one canonical source;
- no source or output is orphaned or silently omitted from the manifest;
- source and output basenames match unless the manifest documents the exception.

For SVG/PNG, perform a visual check after syntax validation. Look for cropped edges, overlapping nodes, missing fonts, unreadable text, incorrect arrow direction, excessive whitespace, and Chinese glyph failures. A file existing on disk is not visual validation.

## 6. Report completion

The final report should include:

- created and modified files;
- canonical source for each diagram;
- published versus local-only files;
- exact render commands and versions;
- link and visual-check results;
- Git preflight and postflight summary;
- unresolved risks or assumptions.
