/**
 * dsh bundle entry for the `software-diagrams` package.
 *
 * Serves the single bundled skill at `skills/software-diagrams/` through
 * `ctx.skills.registerProvider`. The entry is dependency-free ESM: it imports
 * only Node built-ins and no `@deepseek-ai/*` package at runtime, so it loads
 * from a checkout or an installed package without shared peer instances.
 */

import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROVIDER_NAME = 'software-diagrams'
const SKILL_NAME = 'software-diagrams'

// Resolve from this module so the provider works from both a checkout and an
// installed package/cache.
const SKILL_DIRECTORY_URL = new URL('./skills/software-diagrams/', import.meta.url)
const SKILL_FILE_URL = new URL('SKILL.md', SKILL_DIRECTORY_URL)
const SKILL_DIRECTORY = resolve(fileURLToPath(SKILL_DIRECTORY_URL))

// dsh's BUNDLED_SKILL_RANK from `@deepseek-ai/dsh-skill`, hardcoded so this
// entry imports no runtime package.
const BUNDLED_SKILL_RANK = 600

const INVOCATION = { modelInvocable: true, userInvocable: true }
const RESOURCE_BASE = { kind: 'directory', path: SKILL_DIRECTORY }
const DESCRIPTION =
  'Route software-diagram work: choose a format and renderer, then author or redraw architecture, C4, UML, sequence, state, deployment, and dependency diagrams as editable source.'

const SUMMARY = {
  name: SKILL_NAME,
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
}

const CANDIDATE = {
  ...SUMMARY,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_FILE_URL,
}

async function skillFileExists() {
  try {
    return (await stat(SKILL_FILE_URL)).isFile()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Strip a leading YAML frontmatter block. dsh's filesystem provider returns
 * the Markdown body without frontmatter; match that contract here.
 */
function bodyOf(markdown) {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown)
  return (frontmatter ? markdown.slice(frontmatter[0].length) : markdown).trim()
}

const provider = {
  name: PROVIDER_NAME,
  async list() {
    return (await skillFileExists()) ? [CANDIDATE] : []
  },
  async get(candidate) {
    if (candidate?.name !== SKILL_NAME) return undefined
    let markdown
    try {
      markdown = await readFile(SKILL_FILE_URL, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw error
    }
    return { ...SUMMARY, content: bodyOf(markdown) }
  },
}

/** Cordis plugin name. */
export const name = 'software-diagrams'
/** Skill registry service required by this provider. */
export const inject = ['skills']

/** Register the bundled `software-diagrams` skill provider. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}