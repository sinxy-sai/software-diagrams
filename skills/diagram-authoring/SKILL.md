---
name: diagram-authoring
description: Draw a new computer-science diagram from editable source. Frames the question, writes the asset contract, picks the renderer, authors the smallest complete model, renders SVG and PNG with lazily installed renderers, passes the structural, semantic, and visual gates, and reports the asset set. Use when the user wants a diagram that does not exist yet.
---

# Diagram authoring

Default delivery unless the user narrows it: the canonical source, an SVG
export, and a PNG export, under the `tracked-source` publication profile. In a
host project use `docs/diagrams/sources/`, `docs/diagrams/rendered/`, and
`docs/diagram-manifest.json` unless the project already has a compatible
convention.

Work the seven steps in order. Each step lists its input, its output, and the
one checkpoint that must hold before moving on.

### 1. Frame the question
- **Input:** the user's request, plus repository context (README, schema, code) read as needed.
- **Output:** the question the diagram answers; audience and abstraction level; diagram family (architecture, UML, algorithm, data structure, flow, deployment, state, sequence, dependency); destination document; whether a human must keep editing in draw.io or Figma/FigJam.
- **Checkpoint:** infer from context; ask one focused question only when a missing choice blocks a useful first version.

### 2. Write the asset contract
- **Input:** the framing from step 1.
- **Output:** one record per diagram: `id`, `purpose`, `source`, `renderer`, `outputs`, `documents`, `publication`. More than one diagram means a real `diagram-manifest.json`.
- **Checkpoint:** every diagram has a delivery purpose and exactly one canonical source; never a second source file holding the same model.

### 3. Choose the format
- **Input:** the framing and the contract.
- **Output:** one renderer from the selection table in the `software-diagrams` router skill.
- **Checkpoint:** the smallest format that expresses the model naturally; no hand-maintained translation into a second DSL.

### 4. Author the source
- **Input:** the contract and the chosen format.
- **Output:** the canonical source file.
- **Checkpoint:** start with the smallest complete model, then refine only in this order — stable ASCII ids, boundaries and direction, relationship labels and protocols, layout/theme/limited semantic colors, legend and notes. Use shape, line style, and text as well as color; split an overloaded view instead of shrinking text.

Per-family modeling rules while authoring:
- state diagrams: mark initial and final states and every transition condition;
- algorithms: show inputs, state changes, invariants, and termination; put complexity in nearby text when it would clutter the view;
- explanatory material: build a `topic -> prose -> diagram` matrix — the diagram supports the explanation, it does not replace it.

### 5. Render
- **Input:** the source file.
- **Output:** SVG first, PNG second, paths recorded in the contract.
- **Checkpoint:** the renderer is `ready` in `node scripts/sd.mjs doctor`; run `node scripts/sd.mjs ensure <renderer>` first if it is missing. Per-renderer command forms are in [references/toolchain.md](references/toolchain.md). Stop on the first renderer error and repair the canonical source.

### 6. Pass the three gates
- **Input:** the rendered outputs and the manifest.
- **Output:** gate results recorded for step 7.
- **Checkpoint:** all three gates below.

**Structural** — machine-decidable, run it:

```text
node scripts/validate-manifest.mjs <manifest> <projectRoot>
```

Every document path exists, every output exists, every Markdown link resolves,
no source or output is orphaned.

**Semantic** — read the model against the question:
- [ ] the diagram answers its one named question and nothing else;
- [ ] every expected node and actor is present;
- [ ] each arrow points the way the intent says;
- [ ] each arrow has one meaning: calls, depends on, sends, inherits, deploys to, or contains;
- [ ] trust boundaries, runtime boundaries, data stores, and protocols are explicit where the view claims them;
- [ ] labels match the domain vocabulary;
- [ ] color carries meaning only with a legend;
- [ ] no view is overloaded — split it into views instead of shrinking text.

**Visual** — open the SVG and the PNG and check: cropped edges, overlapping
nodes, text size against a real render, arrowheads and line styles, excessive
whitespace, font failures including Chinese glyphs. A file existing on disk is
not visual validation. Do not claim an image is readable because a command
returned zero; open the image or state that you did not.

### 7. Report the asset set
- **Input:** everything from steps 1–6.
- **Output:** canonical source paths; SVG and PNG paths; exact renderer commands and versions; manifest and link results; visual inspection results or the limitation; local-only files and unresolved assumptions.
- **Checkpoint:** report. Do not run `git add`, `git commit`, `git push`, reset, or history rewriting unless the user explicitly asks.

## Publication profiles

- `tracked-source`: source and selected outputs are reviewable and published. Default.
- `local-source/published-artifacts`: source and toolchain stay local; selected outputs are published.
- `local-only-preview`: source and outputs stay local, preview only.

Per-diagram `publication` is `source`, `output`, `both`, or `local` and must
agree with the profile. See
[references/project-workflow.md](references/project-workflow.md).

## References

- [references/project-workflow.md](references/project-workflow.md) — contract table, profiles, Git preflight, delivery checks
- [references/toolchain.md](references/toolchain.md) — one entry per renderer: runtime, output formats, command form
- [references/compatibility.md](references/compatibility.md) — OS/runtime floors and the Windows UTF-8 console diagnosis
