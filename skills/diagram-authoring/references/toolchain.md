# Renderer toolchain

Versions are pinned in exactly one place: the registry inside `scripts/lib`
(`RENDERERS`). This file does not restate version numbers —
`node scripts/sd.mjs doctor` prints the pinned version and the recorded
artifact paths for every renderer.

`<tools>` below means the resolved tools directory: `$SOFTWARE_DIAGRAMS_TOOLS`
if set, else `~/.cache/software-diagrams/tools/`. Install first:
`node scripts/sd.mjs ensure <renderer>`.

## Renderer mapping

| Format | Runtime location | Primary output | Command form |
|---|---|---|---|
| Mermaid | `<tools>/node_modules` (mermaid-cli) | SVG, PNG | from `<tools>`: `npm exec -- mmdc -i src.mmd -o out.svg` (PNG: add `-o out.png -b transparent`) |
| PlantUML | `<tools>/bin/plantuml.jar` + Java | SVG, PNG, PDF | `java -jar <tools>/bin/plantuml.jar -tsvg src.puml` |
| Structurizr DSL | `<tools>/bin/structurizr/` jar + Java | validated DSL; exported PlantUML views render on | `java -jar <structurizr-jar> validate workspace.dsl`, then `export -f plantuml -e <view> workspace.dsl <dir>` and render the export with PlantUML |
| D2 | `<tools>/node_modules` (`@terrastruct/d2` WASM) | SVG | via `scripts/render-wasm.mjs` or an existing project wrapper |
| Graphviz DOT | `<tools>/node_modules` (`@hpcc-js/wasm-graphviz`) | SVG | same WASM path as D2 |
| draw.io XML | `<tools>/node_modules` (drawio-headless) | SVG, PNG | from `<tools>`: `npm exec -- drawio-headless render src.drawio out.svg` (PNG: `render --format png`) |

`sd doctor` is the check that a renderer is present and current; a `missing`
line means run `sd ensure`, a `blocked` line means the environment lacks a
prerequisite (usually Java) or the tools directory is not writable.

## Why D2 and Graphviz use WASM

Native `d2` or `dot` binaries are never required. Node loads the pinned WASM
packages and writes SVG files, which keeps the renderer portable across
Windows, macOS, and Linux. Native CLIs remain acceptable when a project
already standardizes on them; record their versions and keep the WASM path as
a fallback.

## Offline Structurizr

Structurizr's `theme default` can fetch
`https://static.structurizr.com/themes/default/theme.json`. For offline or
restricted-network builds, omit the remote theme unless a local theme file is
provided. Run `validate` first, then `export -f plantuml`, and render the
exported PlantUML locally.

## Mermaid and npx

Do not invoke Mermaid through an unpinned `npx --yes` — it scatters state into
the npm cache instead of the tools directory. Always go through `ensure`, then
run the local binary.

On GitHub-hosted Linux runners, Chromium may fail with `No usable sandbox`
when Mermaid CLI launches Puppeteer. `scripts/puppeteer-ci.json` adds
`--no-sandbox` and `--disable-setuid-sandbox` for the isolated CI runner. Do
not make those flags the default for local browsing or untrusted multi-tenant
environments.

## draw.io source and output

`.drawio` and `.xml` files are editable source, not image files. Keep them
under version control. Use `drawio-headless` (or draw.io Desktop / diagrams.net
by choice) to produce SVG/PNG, and review the exported image once: valid XML
geometry can still render awkwardly.
