/**
 * Static lint for rendered diagram SVG. Pure, dependency-free, Node 20+.
 *
 * The XML reader is tolerant rather than conforming (a bad close tag must not
 * make the report useless) and every check is biased toward silence: a missed
 * warning costs less than a false positive people learn to ignore.
 */
const HIDDEN = new Set([
  'defs', 'mask', 'clippath', 'pattern', 'marker', 'symbol', 'filter',
  'lineargradient', 'radialgradient', 'foreignobject', 'title', 'desc',
  'metadata', 'style', 'script',
]);
const SHAPE_TAGS = new Set(['rect', 'polygon', 'circle', 'ellipse']);
const CONTAINER_CLASSES = new Set(['cluster', 'group', 'panel']);
// Arrowheads are a few units across; comparing them with layout shapes is noise.
const MIN_OVERLAP_AREA = 100;
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const NAMED_COLORS = { black: [0, 0, 0], white: [255, 255, 255] };

/* ------------------------------------------------------------------ XML --- */
function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] !== '#') return named[body] ?? whole;
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}
// Non-greedy tokens; text between them is decoded as character data.
const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!doctype[^>]*>|<\/?[A-Za-z_][^>]*>/gi;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function parseAttributes(body) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(body)) !== null) {
    const name = match[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}
/** Read XML/SVG into a light element tree; throw only when it is undescribable. */
function parseMarkup(source) {
  const doc = { name: '#document', attrs: {}, children: [], order: -1, parent: null, text: '' };
  const lower = source.toLowerCase();
  let current = doc;
  let order = 0;
  let last = 0;
  let match;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(source)) !== null) {
    if (match.index > last) current.text += decodeEntities(source.slice(last, match.index));
    last = TOKEN_RE.lastIndex;
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<?') || /^<!doctype/i.test(token)) continue;
    if (token.startsWith('<![CDATA[')) { current.text += token.slice(9, -3); continue; }
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim().toLowerCase();
      let node = current;
      while (node && node.name !== name) node = node.parent;
      // Unknown and stray end tags are ignored, not fatal.
      if (node && node.name !== '#document') current = node.parent;
      continue;
    }
    const raw = token.slice(1, -1);
    const selfClosing = /\/\s*$/.test(raw);
    const body = selfClosing ? raw.replace(/\/\s*$/, '') : raw;
    const nameMatch = /^([A-Za-z_][\w:.-]*)/.exec(body);
    if (!nameMatch) continue; // a stray "<" in text
    const name = nameMatch[1].toLowerCase();
    current.children.push({ name, attrs: parseAttributes(body.slice(nameMatch[1].length)), children: [], order, parent: current, text: '' });
    const node = current.children[current.children.length - 1];
    order += 1;
    if (selfClosing) continue;
    if (name === 'style' || name === 'script') {
      // CSS/JS can contain raw "<"; consume it whole instead of tokenizing.
      const closeAt = lower.indexOf(`</${name}`, last);
      if (closeAt < 0) throw new Error(`unterminated ${name}`);
      node.text = source.slice(last, closeAt);
      last = closeAt;
      TOKEN_RE.lastIndex = closeAt;
    } else {
      current = node;
    }
  }
  if (last < source.length) current.text += decodeEntities(source.slice(last));
  if (current !== doc) throw new Error(`<${current.name}> is not closed`);
  const root = doc.children[0];
  if (!root || root.name !== 'svg') throw new Error('no <svg> root element');
  return root;
}

/* ------------------------------------------------------------ transforms --- */
function multiply(m, n) {
  return {
    a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
  };
}
const applyPoint = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
/**
 * translate/scale/matrix are honoured; rotate() is ignored (renderers emit
 * rotate(0) or rotate a whole graph) rather than crashing or lying about bboxes.
 */
function parseTransform(value) {
  if (!value) return IDENTITY;
  let matrix = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(value)) !== null) {
    const args = (match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).map(Number);
    const kind = match[1].toLowerCase();
    let next = IDENTITY;
    if (kind === 'translate') next = { ...IDENTITY, e: args[0] ?? 0, f: args[1] ?? 0 };
    else if (kind === 'scale') next = { ...IDENTITY, a: args[0] ?? 1, d: args[1] ?? args[0] ?? 1 };
    else if (kind === 'matrix' && args.length >= 6) next = { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
    matrix = multiply(matrix, next);
  }
  return matrix;
}
const num = (value) => (value == null || value === '' ? NaN : parseFloat(value));
// A length attribute is not a percentage: width="100%" must not become 100.
const length = (value) => (typeof value === 'string' && !value.includes('%') ? parseFloat(value) : NaN);
/** Nested <svg viewBox> (D2) shifts and scales its children; map that back. */
function viewBoxMatrix(element) {
  const box = (element.attrs.viewbox || '').trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return IDENTITY;
  const [minX, minY, width, height] = box;
  const sx = length(element.attrs.width) > 0 ? length(element.attrs.width) / width : 1;
  const sy = length(element.attrs.height) > 0 ? length(element.attrs.height) / height : 1;
  return { a: sx, b: 0, c: 0, d: sy, e: -minX * sx, f: -minY * sy };
}

/* ---------------------------------------------------------------- style --- */
function styleMap(element) {
  const map = {};
  for (const declaration of (element.attrs.style || '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) map[declaration.slice(0, colon).trim().toLowerCase()] = declaration.slice(colon + 1).trim();
  }
  return map;
}
/** Inline style beats a presentation attribute, as in the CSS cascade. */
function resolveValue(element, name) {
  const style = styleMap(element);
  return name in style ? style[name] : element.attrs[name] ?? null;
}
function resolveFontSize(element, inherited) {
  const raw = resolveValue(element, 'font-size');
  let size = raw == null ? NaN : parseFloat(raw);
  if (!Number.isFinite(size)) return inherited ?? 16;
  if (raw.trim().endsWith('%')) size = (size / 100) * (inherited ?? 16);
  else if (raw.trim().endsWith('em')) size *= inherited ?? 16;
  return size;
}
function parseColor(value) {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (text === 'none' || text === 'transparent') return 'none';
  if (text.startsWith('url(')) return 'unknown';
  const named = NAMED_COLORS[text];
  if (named) return { r: named[0], g: named[1], b: named[2] };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const d = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return { r: parseInt(d.slice(0, 2), 16), g: parseInt(d.slice(2, 4), 16), b: parseInt(d.slice(4, 6), 16) };
  }
  const match = /^rgba?\(([^)]*)\)$/.exec(text);
  if (!match) return 'unknown';
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  // Alpha compositing needs a backdrop; four components stay unknown.
  if (parts.length !== 3) return 'unknown';
  const channels = parts.map((part) => (part.endsWith('%') ? parseFloat(part) * 2.55 : parseFloat(part)));
  if (!channels.every(Number.isFinite)) return 'unknown';
  return {
    r: Math.max(0, Math.min(255, Math.round(channels[0]))),
    g: Math.max(0, Math.min(255, Math.round(channels[1]))),
    b: Math.max(0, Math.min(255, Math.round(channels[2]))),
  };
}
function contrastRatio(foreground, background) {
  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color) => 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ------------------------------------------------------------- geometry --- */
function bboxFromPoints(points) {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}
function shapeBox(record) {
  const { el, matrix } = record;
  const attrs = el.attrs;
  if (el.name === 'rect') {
    const x = num(attrs.x) || 0;
    const y = num(attrs.y) || 0;
    const width = num(attrs.width);
    const height = num(attrs.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return bboxFromPoints([[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
      .map(([px, py]) => applyPoint(matrix, px, py)));
  }
  if (el.name === 'polygon') {
    const values = (attrs.points || '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
    if (!values || values.length < 6) return null;
    const points = [];
    for (let i = 0; i + 1 < values.length; i += 2) points.push(applyPoint(matrix, Number(values[i]), Number(values[i + 1])));
    return bboxFromPoints(points);
  }
  const cx = num(attrs.cx);
  const cy = num(attrs.cy);
  const rx = el.name === 'circle' ? num(attrs.r) : num(attrs.rx);
  const ry = el.name === 'circle' ? num(attrs.r) : num(attrs.ry);
  if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return null;
  return bboxFromPoints([[cx - rx, cy - ry], [cx + rx, cy - ry], [cx - rx, cy + ry], [cx + rx, cy + ry]]
    .map(([px, py]) => applyPoint(matrix, px, py)));
}
const boxArea = (box) => Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
const containsBox = (outer, inner) => outer.x1 <= inner.x1 + 0.5 && outer.y1 <= inner.y1 + 0.5
  && outer.x2 >= inner.x2 - 0.5 && outer.y2 >= inner.y2 - 0.5;

/* ---------------------------------------------------------------- text --- */
const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
function advance(char) {
  if (CJK_RE.test(char)) return 1.0;
  if (char === ' ' || char === '\t') return 0.3;
  if (/[.,:;'!|]/.test(char)) return 0.28;
  if (/[mwMW@]/.test(char)) return 0.85;
  if (/[A-Z0-9]/.test(char)) return 0.62;
  return /[a-z]/.test(char) ? 0.5 : 0.55;
}
function estimateWidth(text, fontSize) {
  let em = 0;
  for (const char of text) em += advance(char);
  return em * fontSize;
}
const normalizeText = (value) => value.replace(/\s+/g, ' ').trim();
const textContent = (element) => element.children.reduce((text, child) => text + textContent(child), element.text);
const anchorPoint = (record) => applyPoint(record.matrix, num(record.el.attrs.x) || 0, num(record.el.attrs.y) || 0);
/** A <text> with <tspan> children has one line per tspan; y/dy is not modelled. */
function textLines(record) {
  const anchor = anchorPoint(record);
  const tspans = record.el.children.filter((child) => child.name === 'tspan');
  if (tspans.length === 0) return [{ text: normalizeText(textContent(record.el)), x: anchor.x, y: anchor.y }];
  return tspans.map((tspan) => {
    const x = num(tspan.attrs.x);
    const y = num(tspan.attrs.y);
    const point = applyPoint(record.matrix, Number.isFinite(x) ? x : num(record.el.attrs.x) || 0,
      Number.isFinite(y) ? y : num(record.el.attrs.y) || 0);
    return { text: normalizeText(textContent(tspan)), x: point.x, y: point.y };
  });
}
function textBox(record, lines) {
  const scaleX = Math.hypot(record.matrix.a, record.matrix.b);
  const fontSize = record.fontSize;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const line of lines) {
    const width = estimateWidth(line.text, fontSize) * scaleX;
    const start = record.anchor === 'middle' ? line.x - width / 2 : record.anchor === 'end' ? line.x - width : line.x;
    left = Math.min(left, start); right = Math.max(right, start + width);
    // y is the baseline; 0.8em above and 0.2em below is close enough here.
    top = Math.min(top, line.y - fontSize * 0.8); bottom = Math.max(bottom, line.y + fontSize * 0.2);
  }
  return left === Infinity ? null : { x1: left, y1: top, x2: right, y2: bottom };
}
function snippet(text, max = 40) {
  const flat = normalizeText(text);
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
function elementLabel(element) {
  const id = element.attrs.id;
  const firstClass = (element.attrs.class || '').trim().split(/\s+/)[0];
  if (element.name === 'text') return `text "${snippet(textContent(element), 28)}"`;
  if (id) return `${element.name}#${id}`;
  const own = element.name + (firstClass ? `.${firstClass}` : '');
  // Graphviz leaves shapes anonymous; the enclosing group id is the stable id.
  const parent = element.parent;
  return parent && parent.name === 'g' && parent.attrs.id ? `${own} in g#${parent.attrs.id}` : own;
}

/* ---------------------------------------------------------------- lint --- */
function parseCanvas(root) {
  const box = (root.attrs.viewbox || '').trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) {
    return { minX: box[0], minY: box[1], maxX: box[0] + box[2], maxY: box[1] + box[3], width: box[2], height: box[3] };
  }
  const width = length(root.attrs.width), height = length(root.attrs.height);
  return width > 0 && height > 0 ? { minX: 0, minY: 0, maxX: width, maxY: height, width, height } : null;
}
function collectRecords(root) {
  const records = [];
  const visit = (element, matrix, fontSize, fill, anchor) => {
    for (const child of element.children) {
      if (HIDDEN.has(child.name)) continue;
      let childMatrix = multiply(matrix, parseTransform(child.attrs.transform));
      if (child.name === 'svg') childMatrix = multiply(childMatrix, viewBoxMatrix(child));
      const childFontSize = resolveFontSize(child, fontSize);
      const childFill = resolveValue(child, 'fill') ?? fill;
      const childAnchor = resolveValue(child, 'text-anchor') ?? anchor;
      records.push({ el: child, order: child.order, matrix: childMatrix, fontSize: childFontSize, fill: childFill, anchor: childAnchor });
      visit(child, childMatrix, childFontSize, childFill, childAnchor);
    }
  };
  visit(root, IDENTITY, resolveFontSize(root, null), resolveValue(root, 'fill'), resolveValue(root, 'text-anchor'));
  return records;
}
function cropFinding(file, label, box, canvas) {
  if (!box) return null;
  const sides = [
    ['left', canvas.minX - box.x1], ['right', box.x2 - canvas.maxX],
    ['top', canvas.minY - box.y1], ['bottom', box.y2 - canvas.maxY],
  ];
  const [side, excess] = sides.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  if (excess <= 1) return null;
  return {
    severity: 'error',
    code: 'canvas/cropped',
    message: `${file}: ${label} extends ${excess.toFixed(1)} user units past the ${side} edge of the viewBox`,
  };
}
function ownerBox(record, shapes) {
  const point = anchorPoint(record);
  let owner = null;
  let area = Infinity;
  for (const shape of shapes) {
    const { box } = shape;
    if (point.x < box.x1 || point.x > box.x2 || point.y < box.y1 || point.y > box.y2) continue;
    const candidate = boxArea(box);
    if (candidate < area) { area = candidate; owner = shape; }
  }
  return owner;
}
function boxFillColor(owner) {
  // A missing fill on a container is painted white by renderers in practice.
  if (!owner || owner.record.fill == null) return { r: 255, g: 255, b: 255 };
  const color = parseColor(owner.record.fill);
  return color === 'none' ? { r: 255, g: 255, b: 255 } : color === 'unknown' ? null : color;
}
const isContainerClass = (record) => (record.el.attrs.class || '').trim().toLowerCase().split(/\s+/).some((name) => CONTAINER_CLASSES.has(name));
function overlapFindings(file, shapes) {
  const usable = shapes.filter((shape) => boxArea(shape.box) >= MIN_OVERLAP_AREA && !isContainerClass(shape.record));
  // Only leaf shapes take part: a frame that contains another shape is layout.
  const containers = new Set();
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = 0; j < usable.length; j += 1) {
      if (i !== j && containsBox(usable[j].box, usable[i].box)) containers.add(usable[j]);
    }
  }
  const findings = [];
  const leaves = usable.filter((shape) => !containers.has(shape));
  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const a = leaves[i], b = leaves[j];
      const w = Math.min(a.box.x2, b.box.x2) - Math.max(a.box.x1, b.box.x1);
      const h = Math.min(a.box.y2, b.box.y2) - Math.max(a.box.y1, b.box.y1);
      const smaller = Math.min(boxArea(a.box), boxArea(b.box));
      if (w <= 0 || h <= 0 || smaller <= 0) continue;
      const ratio = (w * h) / smaller;
      if (ratio <= 0.15) continue;
      const labelA = elementLabel(a.record.el), labelB = elementLabel(b.record.el);
      findings.push({ order: b.record.order, finding: {
        severity: 'warning', code: 'shape/overlap', element: labelB,
        message: `${file}: ${labelA} and ${labelB} overlap by ${Math.round(ratio * 100)}% of the smaller shape`,
      } });
    }
  }
  return findings;
}
/**
 * Lint a rendered diagram SVG.
 *
 * Findings are deterministic and reported in document order. `shapeCount`
 * counts rect/polygon/circle/ellipse/path; path geometry is counted but not
 * measured because a useful bbox from arbitrary path data is out of scope.
 *
 * @param {string} svg full SVG source
 * @param {{ file?: string }} [options] label used in messages
 * @returns {{ findings: Array<{severity: 'error'|'warning', code: string, message: string, element?: string}>,
 *   stats: { parsed: boolean, canvas: {width: number, height: number}|null,
 *     textCount: number, shapeCount: number, minFontSize: number|null } }}
 */
export function lintSvg(svg, { file = '<svg>' } = {}) {
  const emptyStats = { parsed: false, canvas: null, textCount: 0, shapeCount: 0, minFontSize: null };
  const fail = (message) => ({ findings: [{ severity: 'error', code: 'svg/parse', message }], stats: emptyStats });
  if (typeof svg !== 'string' || !svg.trim()) return fail(`${file}: input is empty or not a string`);
  let root;
  try { root = parseMarkup(svg); } catch (error) { return fail(`${file}: ${error.message}`); }
  const canvas = parseCanvas(root);
  const records = collectRecords(root);
  const texts = records.filter((record) => record.el.name === 'text');
  const shapes = records.filter((record) => SHAPE_TAGS.has(record.el.name))
    .map((record) => ({ record, box: shapeBox(record) })).filter((shape) => shape.box);
  const ordered = [];
  const add = (record, code, message, severity = 'warning') => ordered.push({
    order: record.order, finding: { severity, code, message, element: elementLabel(record.el) },
  });
  // Document order is report order; overlap findings are sorted in afterwards.
  for (const record of records) {
    const label = elementLabel(record.el);
    if (canvas && SHAPE_TAGS.has(record.el.name)) {
      const finding = cropFinding(file, label, shapeBox(record), canvas);
      if (finding) add(record, 'canvas/cropped', finding.message, 'error');
    }
    if (record.el.name !== 'text') continue;
    const lines = textLines(record);
    const box = textBox(record, lines);
    if (canvas) {
      const finding = cropFinding(file, label, box, canvas);
      if (finding) add(record, 'canvas/cropped', finding.message, 'error');
    }
    const owner = ownerBox(record, shapes);
    if (owner) {
      const available = owner.box.x2 - owner.box.x1 - 2;
      for (const line of lines) {
        if (!line.text) continue;
        const estimated = estimateWidth(line.text, record.fontSize) * Math.hypot(record.matrix.a, record.matrix.b);
        if (estimated <= available) continue;
        add(record, 'text/overflow', `${file}: ${label} is about ${Math.round(estimated)} units wide in a ${Math.round(available + 2)}-unit box`);
      }
    }
    if (record.fontSize < 6) add(record, 'text/tiny', `${file}: ${label} has font-size ${record.fontSize} below the 6-unit minimum`);
    if (owner) {
      const background = boxFillColor(owner);
      const foreground = record.fill == null ? { r: 0, g: 0, b: 0 } : parseColor(record.fill);
      if (background && foreground && foreground !== 'none' && foreground !== 'unknown') {
        const ratio = contrastRatio(foreground, background);
        if (ratio < 3) add(record, 'text/contrast', `${file}: ${label} text contrasts ${ratio.toFixed(2)}:1 against its box fill (minimum 3.0)`);
      }
    }
  }
  ordered.push(...overlapFindings(file, shapes));
  ordered.sort((a, b) => a.order - b.order);
  return {
    findings: ordered.map((entry) => entry.finding),
    stats: {
      parsed: true,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      textCount: texts.length,
      shapeCount: records.filter((record) => SHAPE_TAGS.has(record.el.name) || record.el.name === 'path').length,
      minFontSize: texts.length ? Math.min(...texts.map((record) => record.fontSize)) : null,
    },
  };
}