# Agent metadata

The three skills under `skills/` are the provider-neutral source of truth. The
files in this directory are optional host integrations, not separate
implementations of the workflow.

## Codex

[`openai.yaml`](openai.yaml) supplies Codex UI metadata such as the display
name, default prompt, and implicit invocation policy. Codex creates and
understands this file; it is not a general agent configuration format.

## Other agents

Do not add invented `anthropic.yaml`, `opencode.yaml`, or `deepseek.yaml`
files. Those hosts do not share the `agents/openai.yaml` schema. Use the
host's documented entrypoint instead:

- Claude Code: [`CLAUDE.md`](../CLAUDE.md) for this repository, or the plugin
  install (`.claude-plugin/`) for users.
- OpenCode, dsh, and harnesses with repository agent instructions:
  [`AGENTS.md`](../AGENTS.md), plus the individual `skills/<name>/SKILL.md`
  files through the host's skill mechanism.

This keeps one maintained workflow instead of copying it into provider-specific
files that can drift.
