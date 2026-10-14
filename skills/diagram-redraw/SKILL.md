---
name: diagram-redraw
description: Redraw or modernize an existing diagram into editable code — a screenshot, whiteboard photo, exported PNG, PPT/PPTX slide, draw.io file, or stale hand-maintained DSL. Recovers structure before writing any code, confirms the recovered model with the user, renders it, and compares the render against the original. Use when the user supplies an existing diagram in any form.
---

# Diagram redraw

The blocking risk in this workflow is a misread baked into a source file.
Structure recovery and the user's confirmation come before any codegen.

Work the eight steps in order.

### 1. Read the original
- **Input:** the artifact the user supplied — screenshot, whiteboard photo, PNG/SVG export, PPT/PPTX, `.drawio`/`.xml`, or a legacy DSL file.
- **Output:** its path and kind recorded for the manifest (`origin.kind`: `screenshot`, `whiteboard-photo`, `pptx`, `drawio`, or `legacy-dsl`).
- **Checkpoint:** for a `.drawio` file, read the XML as source, not as an image; it may already be the canonical source.

### 2. Recover the structure — presentation-free
- **Input:** the original artifact.
- **Output:** the model: nodes, edges, groupings, boundaries, swimlanes, legends, as you can defend from what is actually drawn.
- **Checkpoint:** no code, no renderer chosen yet. Guesses are listed as guesses.

### 3. Restate the model to the user
- **Input:** the recovered structure.
- **Output:** a plain-language restatement: entities, relations with directions, groupings, and what you could not read.
- **Checkpoint:** the user confirms or corrects before step 4. A wrong reading that reaches a source file costs more than one question.

### 4. Choose the renderer
- **Input:** the confirmed model.
- **Output:** one renderer from the selection table in the `software-diagrams` router skill; keep `drawio` when the user must continue drag-and-drop editing, modernize otherwise.
- **Checkpoint:** draw.io and Figma/FigJam are editing targets, not renderers of convenience — the canonical source stays local and re-renders.

### 5. Author the source
- **Input:** the confirmed model and chosen format.
- **Output:** the canonical source file.
- **Checkpoint:** smallest complete model first, refined in the standard order (ids, boundaries, labels, layout/theme/colors, legend).

### 6. Render
- **Input:** the source.
- **Output:** SVG first, PNG second.
- **Checkpoint:** `node scripts/sd.mjs doctor` shows the renderer `ready` (run `node scripts/sd.mjs ensure <renderer>` if not). Report the exact commands and versions used.

### 7. Compare against the original — the redraw gate
- **Input:** the render and the original side by side.
- **Output:** a verdict per element group: present/missing, direction right/wrong, grouping kept or lost, and the reason for every intentional deviation.
- **Checkpoint:** this gate is structural fidelity, not aesthetics. Record `parity` in the manifest as `equivalent`, `intentional-change` (with the reason), or `degraded` — and say `degraded` out loud; never quietly ship a lossier diagram. Open both images or state that you did not.

### 8. Deliver
- **Input:** everything above.
- **Output:** source, SVG, PNG, manifest with `origin.path`, `supersedes` equal to that origin path, and `parity`; report of preserved/changed/lost elements.
- **Checkpoint:** handoff only if the user asks — see [references/handoff-figma.md](references/handoff-figma.md) for Figma/FigJam. Do not run `git add`, `git commit`, `git push`, reset, or history rewriting unless the user explicitly asks.

## Semantic checklist (shared with authoring, kept here on purpose)

- [ ] every node and edge in the recovered model appears in the render;
- [ ] each arrow has one meaning and the direction the original showed;
- [ ] boundaries, swimlanes, and legends survived the translation;
- [ ] color carries meaning only with a legend;
- [ ] no view is overloaded — split it instead of shrinking text.

## References

- [references/handoff-figma.md](references/handoff-figma.md) — Figma/FigJam handoff that preserves the canonical source
