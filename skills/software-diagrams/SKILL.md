---
name: software-diagrams
description: Router for computer-science diagram work — architecture, C4, UML, class, sequence, state, deployment, algorithm, data structure, protocol, dependency graphs. Use when the user asks to draw a diagram from scratch or to redraw/modernize an existing diagram (screenshot, whiteboard photo, PNG, PPT export, draw.io file, stale hand-maintained DSL) into editable code.
---

# Software diagrams (router)

Vocabulary, routing, and renderer selection only. The procedures live in the two
workflow skills; this skill runs no steps.

## Vocabulary

- **Canonical source** — the only editable model: a `.mmd`, `.puml`, `.dsl`,
  `.d2`, `.dot`, or `.drawio` file, or an explicitly selected Markdown code
  block. Never hand-edit generated SVG or PNG; fix the source and render again.
- **View** — one rendered picture derived from a source. One source may produce
  several named views (Structurizr); each view is a separate output file.
- **Asset contract** — the per-diagram record: `id`, `purpose`, `source`,
  `renderer`, `outputs`, `documents`, `publication`.
- **Renderer** — `mermaid`, `plantuml`, `structurizr`, `d2`, `graphviz`, or
  `drawio`.
- **Tools directory** — where renderers actually live: `$SOFTWARE_DIAGRAMS_TOOLS`
  if set, otherwise `~/.cache/software-diagrams/tools/`. Renderers are **not
  preinstalled**, and they are never downloaded into a plugin, skill, or host
  project directory.

## Routing

| The user has | Go to |
|---|---|
| A thing to explain, and no existing picture | `diagram-authoring` |
| An existing artifact to convert or modernize: screenshot, whiteboard photo, PNG, PPT/PPTX export, draw.io XML, stale hand-maintained DSL | `diagram-redraw` |
| Only a question about which renderer fits | the table below |

A request that both explains something new and carries an old picture forward is
`diagram-redraw` — recovering the old structure is the blocking step.

## Choose the semantic format

Choose the smallest format that expresses the model naturally:

| need | default | why |
|---|---|---|
| C4 architecture and consistent context/container/component views | Structurizr DSL | one model, many views |
| UML, deployment, component, class, or detailed sequence | PlantUML | precise UML vocabulary and layout |
| documentation-first flow, state, class, ER, or simple sequence | Mermaid | readable in Markdown and broadly supported |
| algorithms, dependency graphs, call graphs, and relation networks | Graphviz DOT | explicit graph semantics and layout engines |
| styled architecture or process view | D2 | concise syntax and strong visual grouping |
| ongoing drag-and-drop editing | draw.io XML | editable diagrams.net document |

Do not translate one model into several hand-maintained DSL files. If another
format is needed, generate it from the canonical source or treat it as a
declared editing handoff.

## Installing a renderer

From this plugin's directory:

```text
node scripts/sd.mjs doctor              # what is ready / stale / missing / blocked
node scripts/sd.mjs ensure <renderer>   # install one renderer into the tools directory
node scripts/sd.mjs ensure --all
```
