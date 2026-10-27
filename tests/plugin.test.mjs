import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as plugin from '../dsh-plugin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_DIR = path.join(ROOT, 'skills', 'software-diagrams');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const pkg = readJson('package.json');

function registeredProvider() {
  let factory;
  plugin.apply({ skills: { registerProvider: (value) => (factory = value) } });
  assert.equal(typeof factory, 'function', 'apply must register a provider factory');
  const provider = factory();
  assert.ok(provider, 'the factory must return a provider');
  return provider;
}

test('the dsh entry registers one provider on the skills service', () => {
  assert.equal(plugin.name, 'software-diagrams');
  assert.deepEqual(plugin.inject, ['skills'], 'the provider needs the skills service');
  const provider = registeredProvider();
  assert.equal(provider.name, 'software-diagrams');
  assert.equal(typeof provider.list, 'function');
  assert.equal(typeof provider.get, 'function');
});

test('the provider advertises the bundled skill at rank 600', async () => {
  const provider = registeredProvider();
  const candidates = await provider.list();
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.equal(candidate.name, 'software-diagrams');
  assert.equal(candidate.rank, 600, 'BUNDLED_SKILL_RANK from @deepseek-ai/dsh-skill');
  assert.equal(candidate.source, 'bundled');
  assert.equal(candidate.provider, 'software-diagrams');
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true });
  assert.equal(candidate.resourceBase.kind, 'directory');
  assert.equal(path.resolve(candidate.resourceBase.path), SKILL_DIR);
  assert.ok(String(candidate.locator).endsWith('/SKILL.md'), 'the locator points at SKILL.md');
  assert.ok(candidate.description.length > 0);
});

test('get() returns the skill body without frontmatter', async () => {
  const provider = registeredProvider();
  const [candidate] = await provider.list();
  const definition = await provider.get(candidate);
  assert.equal(definition.name, 'software-diagrams');
  assert.equal(definition.provider, 'software-diagrams');
  assert.equal(definition.source, 'bundled');
  assert.doesNotMatch(definition.content, /^---/, 'frontmatter must be stripped like the filesystem provider');
  assert.ok(definition.content.trimStart().startsWith('# Software diagrams'), definition.content.slice(0, 40));
  assert.ok(definition.content.includes('references/redraw.md'), 'relative references survive the strip');
  assert.equal(typeof definition.content, 'string');
  assert.equal(definition.resourceBase.path, SKILL_DIR);
});

test('get() rejects a candidate that is not this skill', async () => {
  const provider = registeredProvider();
  assert.equal(await provider.get({ name: 'something-else' }), undefined);
  assert.equal(await provider.get(undefined), undefined);
});

test('package.json carries the dsh bundle declaration this entry needs', () => {
  assert.equal(pkg.type, 'module', 'the entry is ESM');
  assert.equal(pkg.main, 'dsh-plugin.js');
  assert.deepEqual(pkg.exports?.['.'], './dsh-plugin.js');
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml');
  const patchPath = path.join(ROOT, pkg.dsh.bundle.patch);
  assert.ok(fs.existsSync(patchPath), `${pkg.dsh.bundle.patch} must exist`);
  for (const required of ['skills/', 'cordis.patch.yml', 'dsh-plugin.js']) {
    assert.ok(pkg.files?.some((entry) => entry === required || entry === `${required}`), `files must include ${required}`);
  }
});

test('the bundle patch inserts exactly the row that loads this package', () => {
  const patch = fs.readFileSync(path.join(ROOT, pkg.dsh.bundle.patch), 'utf8');
  const rows = [...patch.matchAll(/^\s*-\s+id:\s*(\S+)\s*\n\s*name:\s*(\S+)\s*$/gm)];
  assert.equal(rows.length, 1, 'one insert row, so the package contributes one plugin');
  assert.equal(rows[0][1], pkg.name, 'the row id is the package name');
  assert.equal(rows[0][2], pkg.name, 'the row renders the package entry');
  assert.match(patch, /^-\s+insert:/m, 'the row is inserted, not overriding a base row');
});

test('Codex and Claude manifests point at the same skill directory', () => {
  const codex = readJson('.codex-plugin/plugin.json');
  assert.equal(codex.name, pkg.name);
  assert.equal(codex.version, pkg.version, 'host manifest versions must agree with package.json');
  assert.equal(codex.skills, './skills/');
  assert.ok(fs.statSync(path.join(ROOT, codex.skills, 'software-diagrams', 'SKILL.md')).isFile());

  const claude = readJson('.claude-plugin/plugin.json');
  assert.equal(claude.name, pkg.name);
  assert.equal(claude.version, pkg.version, 'host manifest versions must agree with package.json');

  const market = readJson('.claude-plugin/marketplace.json');
  assert.equal(market.name, pkg.name);
  const pluginEntry = market.plugins?.find((entry) => entry.name === pkg.name);
  assert.ok(pluginEntry, 'the marketplace lists this plugin');
  assert.equal(pluginEntry.source, './');
});

test('the skill stays self-contained and links only files it ships', () => {
  const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill);
  assert.ok(frontmatter, 'SKILL.md starts with frontmatter');
  assert.match(frontmatter[1], /^name:\s*software-diagrams$/m);
  assert.match(frontmatter[1], /^description:\s*\S/m);

  for (const [, target] of skill.matchAll(/\]\((references\/[^)#\s]+)\)/g)) {
    assert.ok(fs.existsSync(path.join(SKILL_DIR, target)), `missing skill reference: ${target}`);
  }
  assert.ok(fs.statSync(path.join(SKILL_DIR, 'scripts', 'sd.mjs')).isFile(), 'the CLI ships inside the skill');

  const stale = [/diagram-authoring\//, /diagram-redraw\//, /scripts\/render-all/, /scripts\/render-wasm/, /scripts\/validate-manifest/];
  for (const file of fs.readdirSync(SKILL_DIR, { recursive: true })) {
    if (!String(file).endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(SKILL_DIR, file), 'utf8');
    for (const pattern of stale) {
      assert.doesNotMatch(text, pattern, `${file} references a deleted path: ${pattern}`);
    }
  }
});