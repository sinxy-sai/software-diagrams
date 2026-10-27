import test from 'node:test';
import assert from 'node:assert/strict';
import { lintSvg } from '../skills/software-diagrams/scripts/lib/lint.mjs';

// Each case is a hand-written mini fixture: no test reads a file from disk.
const svg = (body, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

const codes = (result) => result.findings.map((finding) => finding.code);

const WHITE_BOX = '<rect x="0" y="0" width="100" height="100" fill="#ffffff"/>';

function text(attrs, content = 'Label') {
  return `<text ${attrs}>${content}</text>`;
}

/* ---------------------------------------------------------------- parser --- */

test('parses nested groups, comments, CDATA, PIs and all attribute quoting styles', () => {
  const source = `<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
  <!ENTITY unused "x">
]>
<!-- a comment containing <tags> and &amp; entities -->
<svg viewBox='0 0 50 50' xmlns="http://www.w3.org/2000/svg">
  <!-- another comment -->
  <g transform=translate(1,1)>
    <rect x=1 y=1 width='2' height="2" />
  </g>
  <![CDATA[raw text with <text> inside]]>
  <?pi data?>
  <text x='10' y='30'>hi</text>
</svg>`;
  const result = lintSvg(source, { file: 'basic.svg' });
  assert.equal(result.stats.parsed, true);
  assert.deepEqual(result.stats.canvas, { width: 50, height: 50 });
  assert.equal(result.stats.textCount, 1);
  assert.equal(result.stats.shapeCount, 1);
  assert.deepEqual(result.findings, []);
});

test('decodes entities in text before estimating width', () => {
  const result = lintSvg(svg(`${WHITE_BOX}${text('x="50" y="50" text-anchor="middle" font-size="16" fill="#000000"', 'A &amp; B &#65;')}`));
  assert.equal(result.stats.parsed, true);
  assert.deepEqual(codes(result), []);
});

test('unparseable input never throws and yields exactly one svg/parse error', () => {
  const bad = ['', '   ', 'not svg at all', '<html><body/></html>', '<svg><rect', '<svg><!-- unterminated'];
  for (const source of bad) {
    const result = lintSvg(source, { file: 'broken.svg' });
    assert.equal(result.findings.length, 1, source);
    assert.equal(result.findings[0].code, 'svg/parse');
    assert.equal(result.findings[0].severity, 'error');
    assert.deepEqual(result.stats, {
      parsed: false, canvas: null, textCount: 0, shapeCount: 0, minFontSize: null,
    });
  }
});

test('falls back to width/height when no viewBox is present', () => {
  const result = lintSvg(`<svg width="120" height="80"><rect x="110" y="10" width="20" height="20"/></svg>`);
  assert.deepEqual(result.stats.canvas, { width: 120, height: 80 });
  assert.equal(result.stats.parsed, true);
  assert.deepEqual(codes(result), ['canvas/cropped']);
  assert.match(result.findings[0].message, /right edge/);
});

test('percentage dimensions without a viewBox leave the canvas unknown and skip crop checks', () => {
  const result = lintSvg('<svg width="100%" height="100%"><rect x="900" y="900" width="50" height="50"/></svg>');
  assert.equal(result.stats.parsed, true);
  assert.equal(result.stats.canvas, null);
  assert.deepEqual(result.findings, []);
});

/* -------------------------------------------------------------- canvas --- */

test('canvas/cropped reports the offending element and side, but tolerates one unit', () => {
  const result = lintSvg(svg('<rect id="edge" x="90" y="10" width="20" height="20"/>'
    + '<rect x="0" y="99" width="10" height="1"/>'));
  assert.deepEqual(codes(result), ['canvas/cropped']);
  const [finding] = result.findings;
  assert.equal(finding.severity, 'error');
  assert.equal(finding.element, 'rect#edge');
  assert.match(finding.message, /rect#edge extends 10\.0 user units past the right edge/);
});

test('a text bbox that runs off the canvas is reported too', () => {
  const result = lintSvg(svg(text('x="98" y="50" font-size="16"', 'wide label')));
  assert.deepEqual(codes(result), ['canvas/cropped']);
  assert.match(result.findings[0].message, /right edge/);
});

/* ------------------------------------------------------------ transforms --- */

test('accumulates translate and scale onto points and widths', () => {
  const result = lintSvg(svg('<g transform="translate(10 20) scale(2)">'
    + '<rect x="50" y="0" width="10" height="10"/></g>'));
  assert.deepEqual(codes(result), ['canvas/cropped']);
  assert.match(result.findings[0].message, /30\.0 user units past the right edge/);

  const inside = lintSvg(svg('<g transform="translate(10 20) scale(2)">'
    + '<rect x="0" y="0" width="10" height="10"/></g>'));
  assert.deepEqual(inside.findings, []);
});

test('accepts matrix(), ignores rotate(), and the Graphviz wrapper is a no-op at scale 1', () => {
  const result = lintSvg(svg('<g transform="matrix(1 0 0 1 10 20) rotate(0)"><rect x="0" y="0" width="10" height="10"/></g>'
    + '<g transform="rotate(45)"><rect x="10" y="10" width="10" height="10"/></g>'));
  assert.deepEqual(result.findings, []);
});

test('a Graphviz-shaped fixture with negative coordinates and rotate(0) parses clean', () => {
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<!-- Generated by graphviz version 16.1.0 -->
<svg width="200pt" height="100pt" viewBox="0.00 0.00 200.00 100.00" xmlns="http://www.w3.org/2000/svg">
<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(0 100)">
<title>demo</title>
<polygon fill="white" stroke="none" points="0,0 0,-100 200,-100 200,0 0,0"/>
<g id="node1" class="node">
<title>a</title>
<path fill="#f3f3f5" stroke="black" d="M30,-40 L10,-40 L10,-20 L30,-20 Z"/>
<text xml:space="preserve" text-anchor="middle" x="20" y="-27" font-family="Arial" font-size="14.00" fill="#111111">A</text>
</g>
</g>
</svg>`;
  const result = lintSvg(source, { file: 'graphviz.svg' });
  assert.equal(result.stats.parsed, true);
  assert.deepEqual(result.stats.canvas, { width: 200, height: 100 });
  assert.equal(result.stats.textCount, 1);
  assert.equal(result.stats.shapeCount, 2); // background polygon + node path
  assert.equal(result.stats.minFontSize, 14);
  assert.deepEqual(result.findings, []);
});

test('a D2-shaped fixture uses its nested viewBox and ignores masked-out shapes', () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150">
<svg class="d2-svg" width="300" height="150" viewBox="-50 -50 300 150">
<rect x="-50" y="-50" width="300" height="150" fill="#FFFFFF"/>
<g class="shape"><rect x="100" y="30" width="100" height="50" fill="#F7F8FE" stroke="#0D32B2"/></g>
<text x="150" y="60" fill="#0A0F25" style="text-anchor:middle;font-size:16px">Web App</text>
<mask id="knockout">
<rect x="-50" y="-50" width="300" height="150" fill="white"/>
<rect x="120" y="40" width="60" height="20" fill="black"/>
</mask>
</svg></svg>`;
  const result = lintSvg(source, { file: 'd2.svg' });
  assert.equal(result.stats.parsed, true);
  assert.deepEqual(result.stats.canvas, { width: 300, height: 150 });
  assert.equal(result.stats.textCount, 1);
  assert.equal(result.stats.shapeCount, 2); // only the two visible rects
  // Without the nested-viewBox mapping the -50/-50 background reads as cropped,
  // and without masking the black knockout rect would own the label and trip
  // text/contrast. Both checks must stay silent here.
  assert.deepEqual(result.findings, []);
});

/* --------------------------------------------------------- text overflow --- */

test('text/overflow fires when an estimated line is wider than its owning box', () => {
  const box = '<rect x="150" y="20" width="60" height="30" fill="#ffffff"/>';
  const result = lintSvg(svg(box + text('x="180" y="40" text-anchor="middle" font-size="16"', 'A very long label'), 'viewBox="0 0 400 200"'));
  assert.deepEqual(codes(result), ['text/overflow']);
  assert.match(result.findings[0].message, /about 128 units wide in a 60-unit box/);

  const control = lintSvg(svg(box + text('x="180" y="40" text-anchor="middle" font-size="16"', 'OK'), 'viewBox="0 0 400 200"'));
  assert.deepEqual(control.findings, []);
});

test('text/overflow is skipped when no rect or polygon owns the anchor', () => {
  const result = lintSvg(svg(text('x="50" y="40" font-size="16"', 'A very long label with no box'), 'viewBox="0 0 400 100"'));
  assert.deepEqual(result.findings, []);
});

test('each tspan becomes a line tested against the same box width', () => {
  const box = '<rect x="150" y="20" width="100" height="40" fill="#ffffff"/>';
  const result = lintSvg(svg(box + `<text x="200" y="40" text-anchor="middle" font-size="16">`
    + '<tspan>OK</tspan><tspan>A very long tspan line that will not fit</tspan></text>', 'viewBox="0 0 400 200"'));
  assert.deepEqual(codes(result), ['text/overflow']);
  // Only the long tspan overflows; the short line stays silent.
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].element, /OKA very long tspan line/);
});

test('CJK characters are estimated at one em', () => {
  const box = '<rect x="60" y="10" width="40" height="40" fill="#ffffff"/>';
  const result = lintSvg(svg(box + text('x="80" y="30" text-anchor="middle" font-size="16"', '数据流图'), 'viewBox="0 0 200 100"'));
  assert.deepEqual(codes(result), ['text/overflow']); // 4 CJK * 16 = 64 > 38
});

/* -------------------------------------------------------------- tiny/contrast --- */

test('text/tiny fires below 6 units and respects inherited and inline sizes', () => {
  assert.deepEqual(codes(lintSvg(svg('<g font-size="5">' + text('x="10" y="30" fill="#111111"', 'tiny') + '</g>'))), ['text/tiny']);
  assert.deepEqual(codes(lintSvg(svg(text('x="10" y="30" style="font-size:5px" fill="#111111"', 'tiny')))), ['text/tiny']);
  assert.deepEqual(lintSvg(svg('<g font-size="6">' + text('x="10" y="30" fill="#111111"', 'ok') + '</g>')).findings, []);
});

test('contrast maths follows WCAG: #777 on white is 4.48:1 and passes, #999 fails at 2.85:1', () => {
  const muted = lintSvg(svg(WHITE_BOX + text('x="10" y="30" font-size="16" fill="#777"', 'muted')));
  assert.deepEqual(muted.findings, []);

  const low = lintSvg(svg(WHITE_BOX + text('x="10" y="30" font-size="16" fill="#999"', 'muted')));
  assert.deepEqual(codes(low), ['text/contrast']);
  assert.match(low.findings[0].message, /2\.85:1/);
});

test('text and box fills resolve from style, attributes and ancestors', () => {
  const styledBox = '<rect x="0" y="0" width="100" height="100" style="fill: rgb(255, 255, 255)"/>';
  const styledText = text('x="10" y="30" font-size="16" style="fill:#999"', 'muted');
  assert.deepEqual(codes(lintSvg(svg(styledBox + styledText))), ['text/contrast']);

  const inherited = lintSvg(svg(WHITE_BOX + '<g fill="#999">' + text('x="10" y="30" font-size="16"', 'muted') + '</g>'));
  assert.deepEqual(codes(inherited), ['text/contrast']);

  const named = lintSvg(svg(WHITE_BOX + text('x="10" y="30" font-size="16" fill="black"', 'ink')));
  assert.deepEqual(named.findings, []);
});

test('contrast accepts #rgb and treats a missing or none box fill as white', () => {
  const bare = lintSvg(svg('<rect x="0" y="0" width="100" height="100"/>' + text('x="10" y="30" font-size="16" fill="#999"', 'muted')));
  assert.deepEqual(codes(bare), ['text/contrast']);

  const none = lintSvg(svg('<rect x="0" y="0" width="100" height="100" fill="none"/>' + text('x="10" y="30" font-size="16" fill="#999"', 'muted')));
  assert.deepEqual(codes(none), ['text/contrast']);

  const shortHex = lintSvg(svg(WHITE_BOX + text('x="10" y="30" font-size="16" fill="#abc"', 'pale')));
  assert.deepEqual(codes(shortHex), ['text/contrast']);
});

test('contrast is skipped for gradients, unknown colors and transparent text', () => {
  const gradient = lintSvg(svg('<rect x="0" y="0" width="100" height="100" fill="url(#g)"/>' + text('x="10" y="30" fill="#999"', 'muted')));
  assert.deepEqual(gradient.findings, []);

  const transparent = lintSvg(svg(WHITE_BOX + text('x="10" y="30" fill="transparent"', 'ghost')));
  assert.deepEqual(transparent.findings, []);

  const unknown = lintSvg(svg(WHITE_BOX + text('x="10" y="30" fill="rebeccapurple"', 'odd')));
  assert.deepEqual(unknown.findings, []);
});

/* ------------------------------------------------------------- overlaps --- */

test('shape/overlap fires above 15% of the smaller shape and stays quiet below it', () => {
  const overlap = lintSvg(svg('<rect x="10" y="10" width="40" height="40"/>'
    + '<rect x="30" y="10" width="40" height="40"/>'));
  assert.deepEqual(codes(overlap), ['shape/overlap']);
  assert.match(overlap.findings[0].message, /overlap by 50% of the smaller shape/);

  const sliver = lintSvg(svg('<rect x="10" y="10" width="40" height="40"/>'
    + '<rect x="48" y="10" width="40" height="40"/>'));
  assert.deepEqual(sliver.findings, []);
});

test('shape/overlap skips containers, cluster classes and marker-sized shapes', () => {
  // A big frame containing a small node: the pair is skipped, not reported.
  const container = lintSvg(svg('<rect x="0" y="0" width="90" height="90" fill="#ffffff"/>'
    + '<rect x="20" y="20" width="20" height="20" fill="#eeeeee"/>'));
  assert.deepEqual(container.findings, []);

  const cluster = lintSvg(svg('<rect class="cluster" x="10" y="10" width="40" height="40"/>'
    + '<rect x="30" y="10" width="40" height="40"/>'));
  assert.deepEqual(cluster.findings, []);

  // Arrowheads are small polygons; they are decorators, not layout shapes.
  const arrowheads = lintSvg(svg('<polygon points="10,10 16,10 16,16 10,16"/>'
    + '<polygon points="13,10 19,10 19,16 13,16"/>'));
  assert.deepEqual(arrowheads.findings, []);
});

/* ------------------------------------------------------------- ordering --- */

test('findings are deterministic and ordered by document order', () => {
  const source = svg('<rect x="90" y="10" width="20" height="20"/>'
    + text('x="50" y="50" font-size="4"', 'tiny')
    + '<rect x="10" y="60" width="40" height="30"/>'
    + '<rect x="30" y="60" width="40" height="30"/>');
  const first = lintSvg(source, { file: 'order.svg' });
  assert.deepEqual(codes(first), ['canvas/cropped', 'text/tiny', 'shape/overlap']);
  assert.deepEqual(first.findings.map((finding) => finding.element), ['rect', 'text "tiny"', 'rect']);

  const second = lintSvg(source, { file: 'order.svg' });
  assert.deepEqual(second, first);
});

test('stats report counts, canvas and the smallest resolved font size', () => {
  const source = svg('<rect x="10" y="10" width="20" height="20"/>'
    + text('x="10" y="50" font-size="12"', 'one')
    + text('x="10" y="70" style="font-size:9px"', 'two'));
  const result = lintSvg(source);
  assert.deepEqual(result.stats.canvas, { width: 100, height: 100 });
  assert.equal(result.stats.textCount, 2);
  assert.equal(result.stats.shapeCount, 1);
  assert.equal(result.stats.minFontSize, 9);
});

test('stats.minFontSize is null when the document has no text', () => {
  const result = lintSvg(svg('<rect x="10" y="10" width="20" height="20"/>'));
  assert.equal(result.stats.minFontSize, null);
});