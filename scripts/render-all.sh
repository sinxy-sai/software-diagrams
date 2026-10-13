#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$root/scripts/toolchain.sh"
demo="$root/examples/shop"
source_dir="$demo/sources"
rendered="$demo/rendered"
tool_root="$(resolve_tool_root "$root")"
bin="$tool_root/bin"
mkdir -p "$rendered"
require_file "$bin/plantuml.jar" "PlantUML"
require_file "$bin/structurizr/structurizr.sh" "Structurizr CLI"
require_file "$root/node_modules/drawio-headless/vendor/drawio-headless" "drawio-headless"

npm exec -- mmdc -p "$root/scripts/puppeteer-ci.json" -i "$source_dir/mermaid-sequence.mmd" -o "$rendered/mermaid-sequence.svg"
npm exec -- mmdc -p "$root/scripts/puppeteer-ci.json" -i "$source_dir/mermaid-state.mmd" -o "$rendered/mermaid-state.png" -b transparent
java -jar "$bin/plantuml.jar" -tsvg -o "$rendered" -Playout=smetana "$source_dir/plantuml-class.puml" "$source_dir/plantuml-deployment.puml"
"$bin/structurizr/structurizr.sh" validate -w "$source_dir/structurizr-shop.dsl"
"$bin/structurizr/structurizr.sh" export -w "$source_dir/structurizr-shop.dsl" -f plantuml -o "$rendered"
java -jar "$bin/plantuml.jar" -tsvg -Playout=smetana "$rendered/structurizr-context.puml" "$rendered/structurizr-containers.puml"
node "$root/scripts/render-wasm.mjs"
npm exec -- drawio-headless render "$source_dir/drawio-architecture.drawio" "$rendered/drawio-architecture.svg"
npm exec -- drawio-headless render --format png "$source_dir/drawio-checkout.drawio" "$rendered/drawio-checkout.png"
assert_outputs "$rendered" \
  mermaid-sequence.svg mermaid-state.png plantuml-class.svg plantuml-deployment.svg \
  structurizr-context.svg structurizr-containers.svg d2-architecture.svg d2-checkout.svg \
  graphviz-dependencies.svg graphviz-states.svg drawio-architecture.svg drawio-checkout.png
echo "Rendered diagrams in $rendered"
