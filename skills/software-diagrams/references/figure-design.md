# Figure design: references, not rules

The skill ships no house style. A diagram's visual language is a design decision
that belongs to the diagram itself: a paper figure, an engineering wiki page, a
slide and a chat answer should not look the same. What you cannot derive from
the structure alone is what "good" looks like in a given visual language — so
this file gives you three things and no rules:

1. a shelf of exemplars to borrow from (section 2),
2. a five-line brief that commits you to a direction before you style anything
   (section 1),
3. a three-round way to critique your own render when nobody art-directs you
   (section 4).

Invent a direction that is not on the shelf if the diagram asks for it. The only
requirement is that you can say why the figure looks the way it does.

## 1. Write the brief first

Before choosing colours or fonts, write five lines into the report:

- **Claim** — the one sentence a reader should remember after closing the image.
- **Audience and surface** — paper, wiki, slide, README, chat; how closely they
  will read, and whether they can zoom.
- **Direction** — one shelf entry below, or your own named direction, plus the
  two specific moves you are taking from it.
- **Budget** — element count, number of hues, number of type sizes. Pick numbers
  before you need them; they are the cheapest way to keep a figure coherent.
- **Omissions** — what the figure deliberately leaves out, and where that
  information lives instead (caption, neighbouring figure, prose).

A figure without a brief is a formatted graph. The brief is also what makes the
result reviewable: the owner can disagree with a named direction instead of
guessing at taste.

## 2. The shelf

Each entry is a family of visual language, with the moves worth stealing and the
failure mode to watch. Open the exemplar before you commit; do not work from
this summary alone.

### 2.1 Paper figure (machine-learning systems)

Exemplars: *Attention Is All You Need*, Figure 1; the DeepSeek-V2 and
DeepSeek-V3 technical reports' architecture figures.

Why it works: one vertical spine, color used only to group modules, and the
residual path drawn as a separate thin rail so the main data path stays legible.

Moves to steal: input at the bottom and output at the top; module families get
one fill color each and nothing else is colored; equations set inside the block
they describe; a config note in a corner instead of a legend that repeats what
the labels already say.

Risk: a wall of boxes. It only works with generous outer margins and one
obvious path through the middle; every extra panel has to earn its width.

### 2.2 Distill — annotated explainer

Exemplars: <https://distill.pub/>.

Why it works: the prose is moved out of the drawing into a narrow annotation
rail, numbered against callouts, so the figure can stay sparse.

Moves to steal: number the steps; inset zooms instead of cramming detail into
the main view; before/after pairs; two or three tones plus one accent; one idea
per figure.

Risk: expensive to do well, and an annotation rail needs horizontal space the
diagram may not have.

### 2.3 Transformer Circuits — austere, figure-first

Exemplars: <https://transformer-circuits.pub/>.

Why it works: almost no color, hairline arrows, emphasis by weight and position.
The figure argues; the caption adds the claim.

Moves to steal: thin strokes and small labels that let a dense figure breathe;
one accent tone reserved for the thing under discussion.

Risk: too austere for a busy architecture, and it assumes a reader who zooms.

### 2.4 Illustrated explainer sequence — Jay Alammar

Exemplars: <https://jalammar.github.io/illustrated-transformer/>.

Why it works: the explanation is a sequence of small panels, each answering one
question, with matrices and vectors drawn as heatmaps.

Moves to steal: several small panels instead of one overloaded view; the prose
names the panel ("the figure below shows ..."); heatmap cells for numeric
structure.

Risk: it becomes many figures; if the surface allows only one image, choose the
panel that carries the claim and push the rest into prose.

### 2.5 C4 model — notation discipline

Exemplars: <https://c4model.com/diagrams> and its review checklist,
<https://c4model.com/diagrams/checklist>.

Why it works: every shape, color, line style and arrow head means exactly one
thing, and the checklist asks the reader-facing questions instead of trusting
taste.

Moves to steal: draw boundaries explicitly; label every arrow with its intent;
one notation key; run the checklist against the render.

Risk: the enterprise look, and notation overhead that is wasted below container
level.

### 2.6 Modern SaaS / text-to-diagram gallery

Exemplars: <https://d2lang.com/>.

Why it works: soft containers, muted fills, icon-bearing nodes and one accent
hue on the path that matters — the current default look of engineering blogs.

Moves to steal: container hierarchy with rounded corners and low-contrast
borders; icons for type and labels for instance; a single highlighted path.

Risk: the layout engine owns the composition. Use it when the graph is the
point, not when the composition is.

### 2.7 Iconographic architecture — draw.io and cloud stencils

Exemplars: <https://www.drawio.com/> and the AWS/Azure/Kubernetes shape
libraries.

Why it works: the audience already knows the icons, so the icon carries the type
and the label carries the instance; the grid does the rest.

Moves to steal: consistent icon size; icon plus label, never icon alone; a
legend only for icons that are not universally known.

Risk: icon soup. If the audience does not recognize the stencil, it is noise.

### 2.8 Data-viz grammar for chart-like panels

Exemplars: <https://vega.github.io/vega-lite/>.

Why it works: each variable is encoded in exactly one channel (position, length,
color, size) with a consistent scale, and nothing decorative encodes anything.

Moves to steal: one channel per variable; aligned zero lines; no 3-D, no
gradients that carry no value.

Risk: it is for quantitative panels, not for topology.

## 3. Moves that travel well

Defaults, not rules — break them on purpose and say why.

- One question per figure. If the answer needs "and also", split the figure.
- Structure before style: get nodes, edges and groups right, then color.
- Two or three levels of hierarchy, no more: title, region, element. A fourth
  level means you are annotating, not layering.
- Align to a grid you can see. Consistent gutters read as professional even when
  the palette is plain.
- Whitespace is a feature: outer margin > gap between regions > gap inside a
  region.
- Color carries one meaning and comes with a legend; six hues is already a lot.
- One arrow semantics per figure: data flow, dependency, or control. Mixing them
  needs a line-style distinction and a key.
- Number annotations and put the prose in one place — rail, caption or margin —
  not scattered over the drawing.
- The caption states the claim; the drawing states the structure. Do not make
  the reader read the drawing.
- Squint test at 25%: the hierarchy must survive. Zoom test at 200%: no clipped
  glyphs, no arrowhead buried in a box edge, no label sitting on a line.

## 4. Critique in three rounds

You have no designer, but you have a render and the exemplar you named. Iterate
in three rounds and stop when the remaining fixes are cosmetic.

**R1 — structure, from the source, not the pixels.** Does the render answer the
brief's claim? Is every element needed and every arrow one meaning? Does the
reader know where to start and where to end? Fix by deleting, splitting or
re-grouping; do not touch color yet.

**R2 — hierarchy, at 25% zoom.** Can you still see the claim? Are the levels
distinguishable without reading? Fix with size, weight, position and whitespace;
do not add color.

**R3 — craft, at 200% zoom.** Clipped text, text overflowing a box, misaligned
rows, arrowheads on the wrong edge, a legend missing a meaning, unreadable small
type, font fallback. Fix with spacing and type; do not add elements.

Then put the render next to the exemplar and list the differences as structural
or stylistic. Fix the structural ones. Keep the stylistic ones if they were
deliberate.

## 5. Borrowing without copying

Copy the decision, not the pixels. "This works because the arrows are hairline
and the boxes are quiet" is reusable; "this works because it is #2F6FBA" is not.
If you reuse a layout, keep the semantics that made it work: a residual rail
without residuals is decoration.

## 6. Keep the shelf alive

Add an entry when a reference earns its place: URL, why it works, two moves, one
risk. A shelf entry that cannot produce a move is a bookmark, not a reference.
Name the direction you chose in the report, so the owner can disagree with the
choice instead of only with the result.