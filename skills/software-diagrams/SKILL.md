---
name: software-diagrams
description: Draw computer-science diagrams as editable source, and redraw existing diagrams into code — architecture, C4, UML, class, sequence, state, deployment, algorithm, data structure, dependency graphs. Use when the user asks for a diagram that does not exist yet, or supplies an existing artifact (screenshot, whiteboard photo, PNG, PPT export, draw.io file, stale hand-maintained DSL) to convert or modernize.
---

# Software diagrams

Vocabulary, renderer choice, and the authoring workflow. Redrawing an existing
artifact is a separate procedure: read [references/redraw.md](references/redraw.md)
before starting one.

## Locate the toolchain

This skill ships its own CLI next to this file. Resolve `scripts/sd.mjs` against
this skill's base directory (the host reports it when the skill loads) and run it
with Node.js 20+:

```text
node <skill-dir>/scripts/sd.mjs doctor                          # ready | stale | missing | broken | blocked
node <skill-dir>/scripts/sd.mjs ensure <renderer>|--all         # install pinned renderers
node <skill-dir>/scripts/sd.mjs render <source> -o <output>     # SVG by default; --format png where supported
node <skill-dir>/scripts/sd.mjs render <source> --fidelity      # Graphviz fixed-position mode
node <skill-dir>/scripts/sd.mjs validate <manifest>             # structural gate
```

`doctor` prints the tools directory and whether every renderer really works. A
`missing` line means run `ensure` for that renderer. Renderers are never copied
into a host project or a skill directory; they live in one tools directory that
survives upgrades and can be deleted with `reset --yes`.

## Vocabulary

- **Canonical source** — the only editable model: `.mmd`, `.puml`, `.dsl`,
  `.d2`, `.dot`, or `.drawio`, or a Markdown code block explicitly named as the
  source. Never hand-edit generated SVG or PNG; fix the source and render again.
- **View** — one picture derived from a source. Structurizr produces several
  named views from one model; each view is its own output file.
- **Asset contract** — one record per diagram: `id`, `purpose`, `source`,
  `renderer`, `outputs`, `documents`, `publication`.
- **Renderer** — `mermaid`, `plantuml`, `structurizr`, `d2`, `graphviz`, or
  `drawio`.
- **Fidelity mode** — Graphviz `neato -n`: keep every explicit `pos` coordinate
  instead of re-laying the graph out. This is how a faithful redraw is made;
  see [references/toolchain.md](references/toolchain.md).

## Routing

| The user has | Go to |
|---|---|
| Something to explain, and no existing picture | the workflow below |
| An existing artifact to convert: screenshot, whiteboard photo, PNG, PPT/PPTX, draw.io XML, stale DSL | [references/redraw.md](references/redraw.md) |
| Only a question about which renderer fits | the table below |

A request that both explains something new and carries an old picture forward is
a redraw: recovering the old structure is the blocking step.

## Choose the semantic format

| need | default | why |
|---|---|---|
| C4 architecture and consistent context/container/component views | Structurizr DSL | one model, many views |
| UML, deployment, component, class, or detailed sequence | PlantUML | precise UML vocabulary and layout |
| documentation-first flow, state, class, ER, or simple sequence | Mermaid | readable in Markdown and broadly supported |
| algorithms, dependency graphs, call graphs, relation networks | Graphviz DOT | explicit graph semantics and layout engines |
| styled architecture or process view | D2 | concise syntax and strong visual grouping |
| ongoing drag-and-drop editing | draw.io XML | editable diagrams.net document |

Do not maintain the same model in two hand-edited DSL files. If a second format
is needed, generate it from the canonical source or declare it a one-way editing
handoff.

## Authoring workflow

### 1. Frame the question

- **Input:** the request plus repository context read as needed.
- **Output:** the question the diagram answers; audience and abstraction level;
  diagram family; destination document; whether a human must keep editing in
  draw.io or Figma/FigJam.
- **Checkpoint:** infer from context; ask one focused question only when a
  missing choice blocks a useful first version.

### 2. Write the asset contract

- **Input:** the framing.
- **Output:** per diagram, `id`, `purpose`, `source`, `renderer`, `outputs`,
  `documents`, `publication`. More than one diagram means a real
  `diagram-manifest.json`.
- **Checkpoint:** every diagram has a delivery purpose and exactly one canonical
  source.

### 3. Choose the format

- **Input:** the framing and the contract.
- **Output:** one renderer from the table above.
- **Checkpoint:** the smallest format that expresses the model naturally.

### 4. Author the source

- **Input:** the contract and the chosen format.
- **Output:** the canonical source file.
- **Checkpoint:** smallest complete model first, then refine in this order —
  stable ASCII ids, boundaries and direction, relationship labels and protocols,
  layout/theme/limited semantic color, legend and notes. Use shape, line style,
  and text as well as color; split an overloaded view instead of shrinking text.

Per-family rules: state diagrams mark initial and final states and every
transition condition; algorithms show inputs, state changes, invariants, and
termination, with complexity in nearby text when it would clutter the view;
explanatory material builds a `topic -> prose -> diagram` matrix, because the
diagram supports the explanation rather than replacing it.

### 5. Render

- **Input:** the source file.
- **Output:** SVG first; PNG only when the renderer produces it natively.
- **Checkpoint:** `doctor` shows the renderer `ready`; run `ensure` first if it
  does not. Run `render` and keep the exact command in the report. Stop on the
  first renderer error and repair the source.

Graphviz, D2, and Structurizr export SVG only. Do not promise a bitmap those
renderers cannot make; Mermaid, PlantUML, and draw.io produce PNG natively.

### 6. Pass the gates

**Structural** — run it, do not eyeball it:

```text
node <skill-dir>/scripts/sd.mjs validate <manifest>
```

`semantic` — read the model against the question: the diagram answers its one
named question; every expected node and actor is present; each arrow points the
way the intent says and has exactly one meaning; trust and runtime boundaries,
data stores, and protocols are explicit where claimed; labels use the domain
vocabulary; color carries meaning only with a legend; no view is overloaded.

`visual` — open the rendered SVG and PNG. Check cropped edges, overlapping
nodes, text size against a real render, arrowheads, excessive whitespace, and
font failures including Chinese glyphs. A file on disk is not visual validation;
if you did not open the image, say so.

### 7. Report the asset set

- **Input:** everything above.
- **Output:** canonical source paths; output paths; the exact renderer commands
  and versions; manifest and link results; visual inspection results or the
  limitation; unresolved assumptions.
- **Checkpoint:** report. Do not run `git add`, `git commit`, or `git push`
  unless the user explicitly asks.

## Publication profiles

- `tracked-source` — source and selected outputs are reviewable and published.
  Default.
- `local-source/published-artifacts` — source and toolchain stay local; selected
  outputs are published.
- `local-only-preview` — source and outputs stay local, preview only.

Per-diagram `publication` is `source`, `output`, `both`, or `local` and must
agree with the profile.

## References

- [references/redraw.md](references/redraw.md) — the eight-step redraw procedure and parity gate
- [references/toolchain.md](references/toolchain.md) — renderer support matrix, fidelity mode, command forms
- [references/project-workflow.md](references/project-workflow.md) — contract table, profiles, Git preflight, delivery checks
- [references/compatibility.md](references/compatibility.md) — host and OS requirements, sandbox notes, Windows UTF-8
- [references/handoff-figma.md](references/handoff-figma.md) — optional Figma/FigJam handoff, when the host has Figma tools