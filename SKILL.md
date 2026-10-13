---
name: software-diagrams
description: Create professional computer-science diagrams from editable source code, render reproducible SVG and PNG assets, validate them, and optionally hand them off to draw.io or Figma/FigJam.
---

# Software diagrams

Use this skill when the user needs a software architecture, UML, algorithm, data structure, protocol, dependency, deployment, state, sequence, or systems diagram.

## Core contract

Every diagram is an asset with four parts:

```text
canonical source  ->  SVG export  ->  PNG export
        \-------- manifest and document links --------/
```

- **Canonical source** is the only editable model. It is a `.mmd`, `.puml`, `.dsl`, `.d2`, `.dot`, or `.drawio` file, or an explicitly selected Markdown code block.
- **SVG** is the primary vector export for documentation, publishing, and later import into design tools.
- **PNG** is the compatibility export for tools that do not support SVG.
- **Manifest** records the source, renderer, outputs, documents, and publication policy for repeatable delivery.

Never hand-edit generated SVG or PNG. Fix the canonical source and render again.

## Default delivery

Unless the user says otherwise, deliver all three of these:

1. the editable canonical source;
2. an SVG export;
3. a PNG export.

Use the `tracked-source` publication profile unless the user requests local-only work or published images without source.

## Standard project layout

Use this layout in a host project unless it already has a compatible convention:

```text
docs/diagrams/
  sources/                 # canonical sources
  rendered/                # generated SVG and PNG
  diagram-manifest.json    # asset contract for one diagram set
```

Keep the source and output basenames aligned when one source produces one view. Structurizr may produce multiple named views; list every mapping in the manifest.

## Workflow

### 1. Frame the request

Before writing a file, identify:

- the question the diagram must answer;
- audience and abstraction level;
- diagram family: architecture, UML, algorithm, data structure, flow, deployment, state, sequence, or dependency;
- language, expected size, and destination document;
- whether a human must continue editing it in draw.io or Figma/FigJam.

Infer these from context. Ask one focused question only when a missing choice blocks a useful first version.

### 2. Write the asset contract

For each diagram record:

| field | meaning |
|---|---|
| `id` | stable kebab-case identifier |
| `purpose` | one sentence describing what the view explains |
| `source` | canonical source path |
| `renderer` | `mermaid`, `plantuml`, `structurizr`, `d2`, `graphviz`, or `drawio` |
| `outputs` | SVG and PNG paths, unless a user explicitly narrows the formats |
| `documents` | Markdown, LaTeX, or other files that embed the outputs |
| `publication` | `source`, `output`, `both`, or `local` |

For more than one diagram, create `diagram-manifest.json`. Validate it with:

```powershell
node <skillRoot>/scripts/validate-manifest.mjs <manifest> <projectRoot>
```

### 3. Choose the semantic format

Choose the smallest format that expresses the model naturally:

| need | default | why |
|---|---|---|
| C4 architecture and consistent context/container/component views | Structurizr DSL | one model, many views |
| UML, deployment, component, class, or detailed sequence | PlantUML | precise UML vocabulary and layout |
| documentation-first flow, state, class, ER, or simple sequence | Mermaid | readable in Markdown and broadly supported |
| algorithms, dependency graphs, call graphs, and relation networks | Graphviz DOT | explicit graph semantics and layout engines |
| styled architecture or process view | D2 | concise syntax and strong visual grouping |
| ongoing drag-and-drop editing | draw.io XML | editable diagrams.net document |

Do not translate one model into several hand-maintained DSL files. If another format is needed, generate it from the canonical source or treat it as a declared editing handoff.

### 4. Author the source

Start with the smallest complete model. Then refine it in this order:

1. stable ASCII ids and domain names;
2. boundaries and direction;
3. relationship labels and protocols;
4. layout, theme, and limited semantic colors;
5. legend, notes, and edge cases.

Use shape, line style, and text as well as color to communicate meaning. Split an overloaded diagram into views instead of shrinking text.

### 5. Render locally

Use the dependencies already present under the skill root. Do not run `npm ci` or bootstrap during ordinary diagram work. Install or bootstrap only when a required local executable is actually missing. In a Git worktree, the scripts also discover the main checkout's ignored `tools/` directory; set `SOFTWARE_DIAGRAMS_TOOLS` when tools live elsewhere.

Run the environment check first:

```powershell
pwsh <skillRoot>/scripts/doctor.ps1
```

Then render with the pinned local tools. Typical commands from `skillRoot` are:

```powershell
npm exec -- mmdc -i <source>.mmd -o <output>.svg
npm exec -- mmdc -i <source>.mmd -o <output>.png -b transparent
java -jar tools/bin/plantuml.jar -tsvg <source>.puml
npm exec -- drawio-headless render <source>.drawio <output>.svg
npm exec -- drawio-headless render --format png <source>.drawio <output>.png
```

For D2 and Graphviz, use the repository's WASM helpers or an existing project wrapper. Do not assume that the npm packages provide global `d2` or `dot` commands.

For the checked-in gallery, use `pwsh ./scripts/render-all.ps1`. It tests the gallery only; it does not discover host-project diagrams.

### 6. Validate and inspect

Validation has three separate gates:

1. **Structural:** source syntax, manifest fields, file paths, document links, and output existence.
2. **Semantic:** missing nodes, wrong relationship direction, unclear boundaries, inconsistent labels, and overloaded views.
3. **Visual:** open at least one SVG and one PNG from each renderer family. Check cropping, overlap, text size, arrows, whitespace, fonts, and Chinese glyphs.

Do not claim an image is readable because a command returned zero or a file exists. If visual inspection was not possible, say so.

### 7. Report the asset set

Report:

- canonical source paths;
- SVG and PNG output paths;
- exact renderer commands and versions;
- manifest and link validation results;
- visual inspection results;
- local-only files and unresolved assumptions.

Do not run `git add`, `git commit`, `git push`, reset, or history rewriting unless the user explicitly asks.

## Renderer rules

- Keep renderer dependencies in the skill root. Never copy `node_modules` or downloaded binaries into a host project.
- Keep PlantUML and Structurizr versions pinned by the bootstrap scripts.
- Structurizr `theme default` may fetch the network. Remove the remote theme for offline validation.
- draw.io XML is source, not an image. Always preserve it when exporting SVG or PNG.
- Figma/FigJam is a collaboration or editing target. Preserve the local DSL/SVG source and verify the local render before sharing a Figma link.

## Modeling rules

- Use stable ASCII ids; keep display labels separate.
- Give each arrow one meaning: calls, depends on, sends, inherits, deploys to, or contains.
- Keep colors few and semantic; add a legend when colors carry meaning.
- Show trust boundaries, runtime boundaries, data stores, and protocols in architecture views.
- Mark initial/final states and transition conditions in state diagrams.
- For algorithms, show inputs, state changes, invariants, and termination conditions; put complexity in nearby text when it would clutter the view.
- For explanatory material, build a `topic -> prose -> diagram` matrix. The diagram supports the explanation; it does not replace it.

## Publication profiles

- `tracked-source`: source and selected outputs are reviewable and published. Default.
- `local-source/published-artifacts`: source and toolchain remain local; selected outputs are published.
- `local-only-preview`: source and outputs are local and used only for preview.

Use `publication: source`, `output`, `both`, or `local` per diagram. The profile and per-diagram value must agree. See [references/project-workflow.md](references/project-workflow.md) for the contract and examples.

## Fast checklist

- [ ] The diagram answers one named question.
- [ ] The abstraction level and audience are explicit.
- [ ] One canonical source is declared.
- [ ] SVG and PNG outputs are listed in the manifest.
- [ ] The local renderer was used.
- [ ] Structural and link validation passed.
- [ ] SVG and PNG were visually inspected, or the limitation is reported.
- [ ] Figma/draw.io handoffs preserve the canonical source.
