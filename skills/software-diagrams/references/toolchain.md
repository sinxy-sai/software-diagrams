# Renderer toolchain

Versions, URLs, and digests live in exactly one place: the registry at
`scripts/lib/registry.mjs` inside this skill directory. Nothing here restates a
version pin.

`<skill-dir>` is the directory holding `SKILL.md`; the host reports it when the
skill loads. Resolve every relative path below against it.

```text
node <skill-dir>/scripts/sd.mjs doctor
node <skill-dir>/scripts/sd.mjs ensure <renderer>|--all
node <skill-dir>/scripts/sd.mjs render <source> -o <output> [--format svg|png]
```

`doctor` reports `ready`, `stale`, `missing`, `broken`, or `blocked`. `ready`
means the files on disk were probed and match the pins, not merely that a ledger
entry exists. `broken` means a ledger entry exists but its files are gone or do
not match; run `ensure` to repair it.

## Support matrix

| Renderer | Source | Projects | SVG | PNG | Notes |
|---|---|---|---|---|---|
| Mermaid | `.mmd`, `.mermaid` | Node | yes | yes | rendered through `mmdc` from the tools directory |
| PlantUML | `.puml`, `.plantuml`, `.iuml` | Java 17+ | yes | yes | `-t<format>`; needs Java |
| Structurizr | `.dsl` | Java 17+ | yes | yes | PNG through the exported PlantUML views |
| D2 | `.d2` | Node (WASM) | yes | yes | PNG through the resvg rasterizer |
| Graphviz DOT | `.dot`, `.gv` | Node (WASM) | yes | yes | PNG through the resvg rasterizer |
| draw.io | `.drawio` | Node | yes | yes | headless renderer; needs a native rebuild |

SVG is the default and is always available. PNG is native for Mermaid, PlantUML,
draw.io, and Structurizr; Graphviz and D2 produce it through the rasterizer below.
Every renderer now has a bitmap, so do not fall back to "render SVG and convert
somewhere else" — that step is part of the toolchain.

## PNG rasterization

Graphviz and D2 only emit SVG, so a PNG request renders the SVG and then
rasterizes it with the pinned `resvg` module, installed into the same tools
directory:

```text
node <skill-dir>/scripts/sd.mjs ensure resvg
node <skill-dir>/scripts/sd.mjs render model.dot -o model.png --format png
```

`resvg` needs only Node: the package ships a prebuilt native module, so there is
no compiler, browser, or Chromium download. It rasterizes at 96 dpi, so a
`pt`-sized SVG (what Graphviz writes) gives a bitmap about 4/3 its nominal point
size. It loads the system fonts the SVG names, with one compatibility shim:
Graphviz writes sub/superscripts as the SVG 1.1 `baseline-shift` attribute, which
resvg does not implement, so the rasterizer rewrites that attribute to `dy` on
its own copy of the SVG. The SVG output itself is never modified.

## Fidelity mode (fixed-position reproduction)

Graphviz can reproduce an exact layout instead of choosing one. Fidelity mode
runs Graphviz's `neato` layout engine with `nop`, which honours explicit `pos`
attributes and draws edges exactly through the coordinates it is given:

```text
node <skill-dir>/scripts/sd.mjs render reference.dot -o reference.svg --fidelity
```

`--fidelity` is shorthand for `--engine neato --nop`. The source must then be
written for fixed positions:

- every node has `pos="x,-y!"` (the `!` pins it) and a fixed `width`/`height`;
- the graph sets `splines=line`, `nodesep=0`, `ranksep=0`, `margin=0`;
- orthogonal connectors are routed through tiny invisible `shape=point` nodes,
  declared with `style=invis`, one per bend or junction;
- container rectangles are declared before their children so they paint behind.

This is the only mode that survives a redraw where the layout itself carries
meaning (a paper figure, a slide, a vendor architecture). Without it Graphviz
recomputes the layout and the comparison in the redraw gate becomes meaningless.

## Why WASM for D2 and Graphviz

Native `d2` and `dot` binaries are never required: Node loads the pinned WASM
packages from the tools directory and writes SVG. That keeps the renderer
portable across Windows, macOS, and Linux and avoids a compiler or package
manager. A project that already standardises on native `dot` may use it, but the
skill's own commands stay on the pinned WASM path so results are reproducible.

## D2: what the pinned renderer will not do

Observed on D2 0.1.33 while drawing a dense architecture figure. This is not a
reason to avoid D2; it is the list of decisions D2 makes for you, so the source
you write does not fight them.

- **Set the layout engine.** The default (`dagre`) lays a vertical spine out
  diagonally and routes residual loops as long arcs. `vars.d2-config.layout-engine:
  elk` is what makes a stacked, orthogonal figure hold together.
- **No absolute placement.** There are no coordinates, z-order, connector
  waypoints, or per-side ports. An edge that skips a block moves the whole
  layout; draw it as a labelled dashed callout, or split the figure in two.
- **Nested edges clip.** An edge that leaves a container (a grid, a panel) is
  drawn only to that container's border, and edges out of grid cells pass
  through cells. A grid is decoration, not a routing surface.
- **The title is the container label.** There is no title primitive: no
  subtitle, no left alignment, and a Markdown container label loses the border.
- **Typography defaults surprise.** Multiline plain labels are emitted bold;
  `style.bold: false` restores regular weight, and there is no per-line weight.
  A Markdown label defaults to a text shape unless you set `shape: rectangle`.
- **Values are typed.** `stroke-width` must be an integer 0-15, and `constraint`
  rejects a boolean: it must be the string `"false"`.
- **Scope wildcards by path.** `g1.*` at the wrong nesting level creates phantom
  nodes; write `panel.g1.*`.
- **No BOM.** A UTF-8 BOM turns `vars` into a phantom id and duplicates ids.

## Mermaid and draw.io

Both are npm renderers installed with `--prefix <tools>` and executed from
`<tools>/node_modules/.bin`. Do not invoke Mermaid through an unpinned
`npx --yes`; that scatters state into the npm cache instead of the tools
directory. On GitHub-hosted Linux runners Chromium may fail with
`No usable sandbox`; pass a Puppeteer config with `--no-sandbox` for that
isolated runner only.

## Structurizr: one model, many views

`render <workspace.dsl> -o <output-dir>/` validates the workspace, exports every
view to PlantUML, and renders each view into `<output-dir>`. The `-o` value may
name a directory (with or without a trailing separator) or a file path inside the
intended directory; for a multi-view source its file name is not used. Expect one
output per view plus the per-view `-key` image. `plantuml` must be installed as
well, because the export step only writes PlantUML.

Structurizr's `theme default` fetches a theme from `static.structurizr.com`. For
offline or restricted-network builds, drop the remote theme or point it at a
local theme file.

## draw.io source and output

`.drawio` and `.xml` files are editable source, not images. Keep them under
version control, render SVG/PNG from them, and open the export once: valid XML
geometry can still render awkwardly.