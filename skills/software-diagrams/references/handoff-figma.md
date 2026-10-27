# Figma / FigJam handoff (optional)

This reference applies only when the host session actually provides Figma tools
(`generate_diagram`, `use_figma`, `get_figjam`) or the user exports manually.
Without those tools, state that the handoff is unavailable and deliver local
SVG/PNG outputs instead — do not claim a Figma step you could not perform.

Figma is a collaboration surface and an editing target. It is never the
canonical source, and it does not replace the local renderer or a clean
checkout.

## Before touching Figma, record

- the canonical source path and its DSL;
- the local rendered output used as the visual baseline;
- the Figma/FigJam URL and its `fileKey` when available;
- whether the file is new, an imported copy, or an update to an existing file;
- which local outputs and documents still need to be produced.

Keep the Figma URL in the delivery note, never in place of the source.

## Paths

| Request | Path |
|---|---|
| new flow/sequence/state/ER/Gantt board in FigJam | `generate_diagram` with Mermaid input |
| local diagram into Figma | render locally, import the SVG |
| precise node edits | reconstruct nodes, then incremental `use_figma` edits |
| annotations on a correct base | generate or import, then edit in a separate named layer |

`generate_diagram` accepts `flowchart`, `sequenceDiagram`, `stateDiagram`,
`erDiagram`, and `gantt` input only. Use stable camelCase ids, quoted labels,
and no emoji or HTML in the Mermaid.

An imported SVG may arrive as one opaque group. Do not promise semantic
node-by-node editing of it; either edit the group or rebuild the required part
from native nodes. A PNG is a visual reference only, never an editable source.

## Verification

- **Local:** re-render the canonical source with the pinned toolchain and run
  `sd.mjs validate` on the manifest.
- **Figma:** confirm the URL, inspect the expected nodes/sections, and screenshot
  the changed region for comparison with the local baseline.

Report the source, the rendered outputs, the Figma URL and whether it was
created/imported/edited, the exact local commands, and any unresolved assumption
such as a screenshot-only reconstruction.