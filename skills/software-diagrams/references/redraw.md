# Redraw an existing diagram

The blocking risk is a misread baked into a source file. Recover the structure
first, get the user to confirm it, and only then write code.

### 1. Read the original

- **Input:** the artifact — screenshot, whiteboard photo, PNG/SVG export,
  PPT/PPTX, `.drawio`/`.xml`, or a legacy DSL file.
- **Output:** its path and kind, recorded for the manifest as `origin.kind`:
  `screenshot`, `whiteboard-photo`, `pptx`, `drawio`, or `legacy-dsl`.
- **Checkpoint:** for a `.drawio` file, read the XML as source, not as an image;
  it may already be the canonical source.

### 2. Recover the structure — presentation-free

- **Input:** the original artifact.
- **Output:** the model — nodes, edges, groupings, boundaries, swimlanes,
  legends — as you can defend from what is actually drawn.
- **Checkpoint:** no code, no renderer chosen yet. Flag every guess as a guess.

### 3. Restate the model to the user

- **Input:** the recovered structure.
- **Output:** a plain-language restatement: entities, relations with directions,
  groupings, and anything you could not read.
- **Checkpoint:** the user confirms or corrects before step 4. A wrong reading
  that reaches a source file costs more than one question.

### 4. Choose the renderer

- **Input:** the confirmed model.
- **Output:** one renderer from the selection table in `SKILL.md`. Keep `drawio`
  only when the user must continue drag-and-drop editing; modernize otherwise.
- **Checkpoint:** draw.io and Figma/FigJam are editing targets, not renderers of
  convenience — the canonical source stays local and re-renders.

### 5. Author the source

- **Input:** the confirmed model and format.
- **Output:** the canonical source file.
- **Checkpoint:** smallest complete model first, then refine in the standard
  order: ids, boundaries, labels, layout/theme/colors, legend.

### 6. Render

- **Input:** the source.
- **Output:** SVG, and PNG only where the renderer supports it.
- **Checkpoint:** `doctor` shows the renderer `ready`. For a faithful
  fixed-position reproduction use Graphviz in fidelity mode — see
  [toolchain.md](toolchain.md#fidelity-mode-fixed-position-reproduction) — and
  keep the exact command in the report.

### 7. Compare against the original — the redraw gate

- **Input:** the render and the original side by side.
- **Output:** a verdict per element group: present/missing, direction
  right/wrong, grouping kept or lost, and the reason for every intentional
  deviation.
- **Checkpoint:** this gate is structural fidelity, not aesthetics. Record
  `parity` in the manifest as `equivalent`, `intentional-change` (with the
  reason), or `degraded` — and say `degraded` out loud; never quietly ship a
  lossier diagram. Open both images or state that you did not.

### 8. Deliver

- **Input:** everything above.
- **Output:** source, rendered outputs, a manifest with `origin.path`,
  `supersedes` equal to that origin path, and `parity`; a report of
  preserved/changed/lost elements.
- **Checkpoint:** hand off to Figma only if the user asks and the host actually
  has Figma tools — see [handoff-figma.md](handoff-figma.md). Do not run
  `git add`, `git commit`, or `git push` unless the user explicitly asks.

## Semantic checklist

- [ ] every node and edge in the recovered model appears in the render;
- [ ] each arrow has one meaning and the direction the original showed;
- [ ] boundaries, swimlanes, and legends survived the translation;
- [ ] color carries meaning only with a legend;
- [ ] no view is overloaded — split it instead of shrinking text.